// Run with: node --test scripts/test-entry-list.mjs
// Load the entry component and routes without a browser, database or GitHub credentials.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { z } from "zod";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const { Controller, FormProvider } = require("react-hook-form");
const root = new URL("../", import.meta.url);
const registry = {
  fieldTypes: new Set(["string"]),
  schemas: { string: () => z.string() },
  defaultValues: {},
  readFns: {},
  writeFns: {},
};

function loadSource(path, mocks = {}) {
  const source = readFileSync(new URL(path, root), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const loaded = { exports: {} };
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === "@/fields/registry") return registry;
    if (name.startsWith("@/")) return loadSource(`${name.slice(2)}.ts`, mocks);
    return require(name);
  };
  new Function("require", "module", "exports", "window", outputText)(
    localRequire, loaded, loaded.exports, { addEventListener() {}, removeEventListener() {} },
  );
  return loaded.exports;
}

const { initializeState, generateZodSchema } = loadSource("lib/schema.ts");
const { ConfigSchema } = loadSource("lib/config-schema.ts");
const { normalizeConfig } = loadSource("lib/config.ts");
const { parse, stringify } = loadSource("lib/serialization.ts");
const element = (tag) => ({ children, ...props }) => createElement(tag, props, children);
const { EntryForm } = loadSource("components/entry/entry-form.tsx", {
  "@/fields/registry": {
    ...registry,
    editComponents: { string: ({ field, ...props }) => createElement("input", props) },
  },
  "@/components/ui/form": {
    Form: FormProvider, FormField: Controller, FormMessage: () => null,
    ...Object.fromEntries(["FormControl", "FormDescription", "FormItem", "FormLabel"].map((name) => [name, element("div")])),
  },
  "@/components/ui/button": { Button: element("button") },
  "@/components/ui/label": { Label: element("label") },
  "@/components/ui/badge": { Badge: element("span") },
  "@/components/ui/tooltip": {
    Tooltip: element("span"), TooltipTrigger: ({ children }) => children, TooltipContent: () => null,
  },
  "@/components/ui/alert-dialog": {
    AlertDialog: ({ children }) => children, AlertDialogContent: () => null,
    AlertDialogTrigger: ({ children }) => children,
  },
});
const hours = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
  .map((day) => ({ day, abbr: day.slice(0, 3), time: "8am - 5pm" }));
const options = { min: 7, max: 7, collapsible: true };

function makeConfig(list, format = "yaml", fields = ["day", "abbr", "time"].map((name) => ({ name, type: "string" }))) {
  const schema = { name: "hours", type: "file", path: `_data/hours.${format === "yaml" ? "yml" : "json"}`, list, fields };
  assert.equal(ConfigSchema.safeParse({ content: [schema] }).success, true);
  return {
    owner: "owner", repo: "repo", branch: "main",
    object: normalizeConfig({ content: [schema] }),
  };
}

// The component's children are not rendered here. Retain hook state and flush effects
// so the fetched entry reaches EntryForm's props, without mounting the surrounding UI.
function renderEntry(config, contentObject, { isNew = false } = {}) {
  const states = [];
  let cursor;
  let effects;
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
    return [states[index], (value) => {
      states[index] = typeof value === "function" ? value(states[index]) : value;
    }];
  };
  const noop = () => {};
  const ui = new Proxy({}, { get: (_, name) => name });
  const entry = { name: "hours.yml", sha: "original", contentObject };
  const schema = config.object.content[0];
  const { Entry } = loadSource("components/entry/entry.tsx", {
    react: {
      Fragment: "fragment", useState, useRef: (value) => ({ current: value }),
      useMemo: (fn) => fn(), useCallback: (fn) => fn,
      useEffect: (fn) => effects.push(fn),
    },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "next/navigation": { useRouter: () => ({ push: noop, replace: noop }) },
    "next/link": ui,
    "@/contexts/config-context": { useConfig: () => ({ config }) },
    "@/components/repo/repo-header-context": { useRepoHeader: noop },
    "./entry-form": { EntryForm: "EntryForm" },
    "./entry-history": ui,
    "@/components/empty-create": ui,
    "@/components/file/file-options": ui,
    "@/components/repo/repo-action-buttons": ui,
    ...Object.fromEntries([
      "button", "button-group", "input-group", "tooltip", "empty", "breadcrumb", "dropdown-menu", "skeleton",
    ].map((name) => [`@/components/ui/${name}`, ui])),
    "sonner": { toast: { promise: noop } },
    "lucide-react": ui,
    swr: {
      __esModule: true,
      default: (key) => typeof key === "string" ? { data: entry, isLoading: false } : {},
      useSWRConfig: () => ({ mutate: noop }),
    },
  });
  let output;
  for (let i = 0; i < 3; i++) {
    cursor = 0;
    effects = [];
    output = Entry({ name: "hours", path: isNew ? undefined : schema.path });
    effects.forEach((effect) => effect());
  }
  assert.equal(output.type, "EntryForm");
  return output.props;
}

async function save(config, data) {
  let written;
  let fileContent;
  const { POST } = loadSource("app/api/[owner]/[repo]/[branch]/files/[path]/route.ts", {
    "@/lib/session-server": { requireApiUserSession: async () => ({ user: { id: "user" } }) },
    "@/lib/token": { getToken: async () => ({ token: "test-token" }) },
    "@/lib/config-store": { getConfig: async () => config },
    "@/lib/github-cache-file": { updateFileCache: async () => {} },
    "@/lib/authz-shared": {},
    "@/lib/utils/octokit": {
      createOctokitInstance: () => ({ rest: { repos: {
        createOrUpdateFileContents: async (data) => {
          fileContent = Buffer.from(data.content, "base64").toString();
          written = parse(fileContent, { format: config.object.content[0].format });
          return { data: { content: { path: data.path, sha: "saved" }, commit: { sha: "commit" } } };
        },
      } } }),
    },
  });
  const path = config.object.content[0].path;
  const response = await POST(new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify(data),
  }), { params: Promise.resolve({ owner: "owner", repo: "repo", branch: "main", path }) });
  return { response, written, fileContent };
}

for (const format of ["yaml", "json"]) {
  for (const list of [true, options, { collapsible: false }, { collapsible: { collapsed: true, summary: "{fields.day}" } }]) {
    test(`${format} list ${JSON.stringify(list)} loads and saves the complete array`, async (t) => {
      const config = makeConfig(list, format);
      const stored = parse(stringify(hours, { format }), { format });
      const form = renderEntry(config, stored);
      const values = initializeState(form.fields, form.contentObject);
      assert.deepEqual(values, { listWrapper: hours });
      assert.equal(form.fields[0].name, "listWrapper");
      assert.deepEqual(form.fields[0].list, list);
      assert.equal(generateZodSchema(form.fields).safeParse(values).success, true);
      const markup = renderToStaticMarkup(createElement(EntryForm, form));
      for (const [index, hour] of hours.entries()) {
        assert.ok(markup.includes(`name="listWrapper.${index}.day"`));
        assert.ok(markup.includes(`value="${hour.day}"`));
      }
      if (typeof list === "object" && list.collapsible?.collapsed) {
        assert.ok(markup.includes("Expand all"));
        assert.ok(markup.includes(">Monday</span>"));
      }
      if (typeof list === "object" && list.max === hours.length) {
        assert.ok(!markup.includes("Add an item"));
      }
      if (typeof list === "object" && list.collapsible === false) {
        assert.ok(!markup.includes("Collapse all"));
        assert.ok(!markup.includes("Expand all"));
      }

      let payload;
      t.mock.method(globalThis, "fetch", async (_url, request) => {
        payload = JSON.parse(request.body);
        return Response.json({ status: "success", data: { sha: "saved" } });
      });
      await form.onSubmit(values);
      assert.deepEqual(payload.content, hours);
      const { response, written } = await save(config, payload);
      assert.equal(response.status, 200);
      assert.deepEqual(written, hours);
    });
  }
}

test("object-form lists enforce min/max in the form", () => {
  const form = renderEntry(makeConfig(options), hours);
  const schema = generateZodSchema(form.fields);
  for (const content of [hours.slice(1), [...hours, hours[0]]]) {
    assert.equal(schema.safeParse({ listWrapper: content }).success, false);
  }
});

test("the save route still validates root-list item fields", async (t) => {
  t.mock.method(console, "error", () => {});
  const content = hours.map((hour, index) => index === 0 ? { ...hour, day: 42 } : hour);
  for (const list of [true, options]) {
    const { response, written } = await save(makeConfig(list), {
      type: "content", name: "hours", sha: "original", content,
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).message, /Content validation failed: .*listWrapper\.0\.day/);
    assert.equal(written, undefined);
  }
});

for (const format of ["yaml", "json"]) {
  test(`missing ${format} root-list files can be created before satisfying min/max`, async (t) => {
    const config = makeConfig(options, format);
    const errors = [];
    const navigations = [];
    const created = [];
    let refreshes = 0;
    let payload;
    let saved;
    const noop = () => {};
    const { EmptyCreate } = loadSource("components/empty-create.tsx", {
      react: { useState: (initial) => [initial, noop] },
      "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
      "next/navigation": { useRouter: () => ({
        push: (url) => navigations.push(url), refresh: () => refreshes++,
      }) },
      "@/contexts/config-context": { useConfig: () => ({ config }) },
      "@/components/ui/button": { Button: "Button" },
      "lucide-react": { Loader: "Loader" },
      "sonner": { toast: { loading: noop, success: noop, error: (message) => errors.push(message) } },
    });
    t.mock.method(console, "error", () => {});
    t.mock.method(globalThis, "fetch", async (url, request) => {
      assert.equal(url, `/api/owner/repo/main/files/${encodeURIComponent(config.object.content[0].path)}`);
      assert.equal(request.method, "POST");
      payload = JSON.parse(request.body);
      saved = await save(config, payload);
      return saved.response;
    });
    const button = EmptyCreate({
      type: "content", name: "hours", children: "Create file", onCreate: (path) => created.push(path),
    });
    await button.props.onClick();
    assert.deepEqual(payload, { type: "content", name: "hours", content: [] });
    assert.equal(saved.response.status, 200, errors.join("\n"));
    assert.deepEqual(errors, []);
    assert.deepEqual(created, [config.object.content[0].path]);
    assert.deepEqual(navigations, ["/owner/repo/main/file/hours?empty-created"]);
    assert.equal(refreshes, 1);

    // Read through the entry route as well: empty files are normalized back to
    // root arrays before the editor opens.
    const { GET } = loadSource("app/api/[owner]/[repo]/[branch]/entries/[path]/route.ts", {
      "@/lib/session-server": { requireApiUserSession: async () => ({ user: { id: "user" } }) },
      "@/lib/token": { getToken: async () => ({ token: "test-token" }) },
      "@/lib/config-store": { getConfig: async () => config },
      "@/lib/authz-shared": {},
      "@/lib/utils/octokit": { createOctokitInstance: () => ({ rest: { repos: {
        getContent: async () => ({ data: {
          type: "file", content: Buffer.from(saved.fileContent).toString("base64"),
        } }),
      } } }) },
    });
    const response = await GET({ nextUrl: new URL("http://localhost?name=hours") }, {
      params: Promise.resolve({ owner: "owner", repo: "repo", branch: "main", path: config.object.content[0].path }),
    });
    assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.deepEqual(data.contentObject, []);
    const form = renderEntry(config, data.contentObject);
    const values = initializeState(form.fields, form.contentObject);
    assert.deepEqual(values, { listWrapper: [] });
    assert.equal(generateZodSchema(form.fields).safeParse(values).success, false);
  });
}

test("empty and new root lists initialize as empty arrays", () => {
  for (const list of [true, { collapsible: false }]) {
    const config = makeConfig(list);
    for (const isNew of [false, true]) {
      const form = renderEntry(config, [], { isNew });
      assert.deepEqual(initializeState(form.fields, form.contentObject), { listWrapper: [] });
    }
  }
});

test("list:false still edits and saves a normal object", async (t) => {
  const config = makeConfig(false);
  const form = renderEntry(config, hours[0]);
  const values = initializeState(form.fields, form.contentObject);
  assert.deepEqual(values, hours[0]);
  let payload;
  t.mock.method(globalThis, "fetch", async (_url, request) => {
    payload = JSON.parse(request.body);
    return Response.json({ status: "success", data: { sha: "saved" } });
  });
  await form.onSubmit(values);
  assert.deepEqual(payload.content, hours[0]);
  const { response, written } = await save(config, payload);
  assert.equal(response.status, 200);
  assert.deepEqual(written, hours[0]);
});

test("entries without fields retain the raw code editor and body payload", async (t) => {
  let payload;
  t.mock.method(globalThis, "fetch", async (_url, request) => {
    payload = JSON.parse(request.body);
    return Response.json({ status: "success", data: { sha: "saved" } });
  });
  for (const list of [true, options, false]) {
    const content = { body: "- day: Monday\n" };
    const form = renderEntry(makeConfig(list, "yaml", []), content);
    assert.equal(form.fields[0].name, "body");
    assert.equal(form.fields[0].type, "code");
    assert.equal(form.fields[0].list, undefined);
    const values = initializeState(form.fields, form.contentObject);
    assert.deepEqual(values, content);
    await form.onSubmit(values);
    assert.deepEqual(payload.content, content);
  }
});
