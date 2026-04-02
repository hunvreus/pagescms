(function () {
  var scriptElement = document.currentScript;
  if (!scriptElement) return;

  var scriptUrl = new URL(scriptElement.src, window.location.href);
  var cmsOrigin = scriptElement.getAttribute("data-pagescms-origin") || scriptUrl.origin;
  var owner = scriptElement.getAttribute("data-pagescms-owner") || "";
  var repo = scriptElement.getAttribute("data-pagescms-repo") || "";
  var branch = scriptElement.getAttribute("data-pagescms-branch") || "main";
  var sessionKey = "pagescms:admin-visible";
  var isEmbedded = window.top !== window;
  var hostElement = null;
  var shadowRootElement = null;
  var barElement = null;
  var editButtonElement = null;
  var addButtonElement = null;
  var closeButtonElement = null;
  var menuElement = null;
  var bootstrapPromise = null;
  var bootstrapData = null;
  var warnedPreviewTargets = {};

  function createIcon(paths) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("style", "width:16px;height:16px;display:block;");

    paths.forEach(function (definition) {
      var node = document.createElementNS("http://www.w3.org/2000/svg", definition.type);
      Object.keys(definition.attributes).forEach(function (name) {
        node.setAttribute(name, definition.attributes[name]);
      });
      svg.appendChild(node);
    });
    return svg;
  }

  function createPencilIcon() {
    return createIcon([
      { type: "path", attributes: { d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" } },
      { type: "path", attributes: { d: "m15 5 4 4", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" } },
    ]);
  }

  function createPlusIcon() {
    return createIcon([
      { type: "path", attributes: { d: "M12 5v14", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" } },
      { type: "path", attributes: { d: "M5 12h14", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" } },
    ]);
  }

  function createCloseIcon() {
    return createIcon([
      { type: "path", attributes: { d: "M18 6 6 18", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" } },
      { type: "path", attributes: { d: "m6 6 12 12", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" } },
    ]);
  }

  function ensureUiRoot() {
    if (shadowRootElement) return shadowRootElement;

    hostElement = document.createElement("div");
    hostElement.id = "pagescms-widget-root";
    hostElement.setAttribute("aria-hidden", "false");
    shadowRootElement = hostElement.attachShadow({ mode: "open" });

    var style = document.createElement("style");
    style.textContent = [
      ":host { all: initial; }",
      ".pagescms-root, .pagescms-root * { box-sizing: border-box; }",
      ".pagescms-root { all: initial; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: oklch(0.985 0.001 106.423); }",
      ".pagescms-bar { all: unset; position: fixed; left: 16px; bottom: 16px; z-index: 2147483647; display: none; flex-direction: column; align-items: center; gap: 0; padding: 4px; border-radius: 0.875rem; border: 1px solid oklch(1 0 0 / 0.1); background: oklch(0.147 0.004 49.25 / 0.94); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.18), 0 2px 4px -2px rgba(0,0,0,0.18); }",
      ".pagescms-button { all: unset; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 0.5rem; background: transparent; color: oklch(0.709 0.01 56.259); cursor: pointer; transition: background-color 120ms ease, color 120ms ease, opacity 120ms ease; -webkit-tap-highlight-color: transparent; }",
      ".pagescms-button:hover, .pagescms-button:focus-visible, .pagescms-button[data-open='true'] { background: oklch(0.216 0.006 56.043); color: oklch(0.985 0.001 106.423); }",
      ".pagescms-button:focus-visible { outline: 2px solid oklch(0.553 0.013 58.071); outline-offset: 2px; }",
      ".pagescms-button[hidden] { display: none; }",
      ".pagescms-menu { position: fixed; z-index: 2147483647; width: max-content; min-width: 120px; max-width: calc(100vw - 32px); overflow: hidden; border: 1px solid oklch(1 0 0 / 0.1); border-radius: 0.5rem; background: oklch(0.216 0.006 56.043); color: oklch(0.985 0.001 106.423); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.18), 0 2px 4px -2px rgba(0,0,0,0.18); outline: none; padding: 0.25rem; opacity: 0; transform: translateY(4px) scale(0.95); transform-origin: left center; pointer-events: none; visibility: hidden; transition: opacity 120ms ease, transform 120ms ease, visibility 120ms step-end; }",
      ".pagescms-menu[data-open='true'] { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; visibility: visible; transition: opacity 120ms ease, transform 120ms ease, visibility 0s; }",
      ".pagescms-empty { margin: 0; padding: 0.375rem 0.5rem; color: oklch(0.709 0.01 56.259); font-size: 0.875rem; line-height: 1.25rem; }",
      ".pagescms-items { display: grid; gap: 0; }",
      ".pagescms-item { all: unset; display: flex; width: 100%; min-height: 0; align-items: center; gap: 0.5rem; border-radius: 0.375rem; padding: 0.375rem 0.5rem; color: oklch(0.985 0.001 106.423); font-size: 0.875rem; line-height: 1.25rem; font-weight: 400; white-space: nowrap; text-decoration: none; cursor: pointer; transition: background-color 120ms ease, color 120ms ease; }",
      ".pagescms-item:hover, .pagescms-item:focus-visible { background: oklch(0.268 0.007 34.298); color: oklch(0.985 0.001 106.423); }",
      ".pagescms-item:focus-visible { outline: none; }",
    ].join("");

    var root = document.createElement("div");
    root.className = "pagescms-root";
    shadowRootElement.appendChild(style);
    shadowRootElement.appendChild(root);
    document.body.appendChild(hostElement);

    return shadowRootElement;
  }

  function getCurrentMetadataValue(name) {
    var meta = document.querySelector('meta[name="' + name + '"]');
    return meta ? meta.getAttribute("content") : null;
  }

  function buildRepoUrl() {
    if (!owner || !repo || !branch) return cmsOrigin;
    return cmsOrigin
      + "/"
      + encodeURIComponent(owner)
      + "/"
      + encodeURIComponent(repo)
      + "/"
      + encodeURIComponent(branch);
  }

  function buildEditUrl() {
    var contentName = getCurrentMetadataValue("pagescms:name");
    var contentType = getCurrentMetadataValue("pagescms:type");
    var contentPath = getCurrentMetadataValue("pagescms:path");

    if (!contentName) return null;

    if (contentType === "file") {
      return buildRepoUrl() + "/file/" + encodeURIComponent(contentName);
    }

    if (contentType === "collection" && contentPath) {
      return buildRepoUrl()
        + "/collection/"
        + encodeURIComponent(contentName)
        + "/edit/"
        + encodeURIComponent(contentPath);
    }

    return null;
  }

  function normalizePathname(pathname) {
    if (!pathname || pathname === "/") return "/";
    return pathname.replace(/\/+$/, "") || "/";
  }

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function getCurrentPathname() {
    return normalizePathname(new URL(window.location.href).pathname);
  }

  function buildCollectionEditUrl(name, contentPath) {
    return buildRepoUrl()
      + "/collection/"
      + encodeURIComponent(name)
      + "/edit/"
      + encodeURIComponent(contentPath);
  }

  function getTokenValue(params, tokenName) {
    if (Object.prototype.hasOwnProperty.call(params, tokenName)) {
      return params[tokenName];
    }

    if (tokenName === "primary" || tokenName === "slug") {
      if (Object.prototype.hasOwnProperty.call(params, "slug")) return params.slug;
      if (Object.prototype.hasOwnProperty.call(params, "primary")) return params.primary;
      var keys = Object.keys(params);
      if (keys.length > 0) return params[keys[0]];
    }

    return "";
  }

  function resolveFilenameFromRoute(route, params) {
    if (!route || route.type !== "collection") return null;

    var template = typeof route.filename === "string" && route.filename
      ? route.filename
      : "";
    var hasUnsupportedDateToken = /\{(?:year|month|day|hour|minute|second)\}/.test(template);

    if (template && !hasUnsupportedDateToken) {
      var failed = false;
      var resolved = template.replace(/\{(?:fields\.)?([^}]+)\}/g, function (_, token) {
        var tokenValue = getTokenValue(params, token);
        if (!tokenValue) {
          failed = true;
          return "";
        }
        return String(tokenValue);
      });

      if (!failed && resolved.indexOf("{") === -1) {
        return resolved;
      }
    }

    var fallbackValue = getTokenValue(params, "slug");
    if (!fallbackValue) {
      var paramKeys = Object.keys(params);
      fallbackValue = paramKeys.length > 0 ? params[paramKeys[0]] : "";
    }

    if (!fallbackValue) return null;

    var extension = route.extension ? "." + String(route.extension).replace(/^\./, "") : "";
    return String(fallbackValue) + extension;
  }

  function matchRoutePath(route) {
    if (!route || !route.sitePath) return null;

    var tokenNames = [];
    var pattern = "^" + escapeRegex(normalizePathname(route.sitePath))
      .replace(/\\\{([^}]+)\\\}/g, function (_, token) {
        tokenNames.push(token);
        return "([^/]+)";
      }) + "/?$";
    var match = new RegExp(pattern).exec(getCurrentPathname());
    if (!match) return null;

    var params = {};
    tokenNames.forEach(function (token, index) {
      params[token] = decodeURIComponent(match[index + 1]);
    });
    return params;
  }

  function buildRouteEditUrl(route) {
    if (!route || !route.name) return null;

    if (route.type === "file" && normalizePathname(route.sitePath) === getCurrentPathname()) {
      return buildRepoUrl() + "/file/" + encodeURIComponent(route.name);
    }

    if (route.type !== "collection" || !route.contentPath) return null;

    var params = matchRoutePath(route);
    if (!params) return null;

    var filename = resolveFilenameFromRoute(route, params);
    if (!filename) return null;

    return buildCollectionEditUrl(
      route.name,
      route.contentPath.replace(/\/+$/, "") + "/" + filename,
    );
  }

  function buildResolvedEditUrl() {
    var metadataUrl = buildEditUrl();
    if (metadataUrl) return metadataUrl;
    if (!bootstrapData || !Array.isArray(bootstrapData.routes)) return null;

    for (var index = 0; index < bootstrapData.routes.length; index += 1) {
      var routeEditUrl = buildRouteEditUrl(bootstrapData.routes[index]);
      if (routeEditUrl) return routeEditUrl;
    }

    return null;
  }

  function createMenuItem(options) {
    ensureUiRoot();
    var element = document.createElement(options.href ? "a" : "button");
    if (options.href) {
      element.href = options.href;
      if (options.external !== false) {
        element.target = "_blank";
        element.rel = "noreferrer";
      }
    } else {
      element.type = "button";
    }

    element.textContent = options.label;
    element.className = "pagescms-item";

    if (typeof options.onClick === "function") {
      element.addEventListener("click", options.onClick);
    }

    return element;
  }

  function createActionButton(label, icon) {
    var element = document.createElement("button");
    element.type = "button";
    element.className = "pagescms-button";
    element.setAttribute("aria-label", label);
    element.setAttribute("title", label);
    element.appendChild(icon);
    return element;
  }

  function ensureBar() {
    if (barElement) return barElement;

    var root = ensureUiRoot().querySelector(".pagescms-root");
    barElement = document.createElement("div");
    barElement.className = "pagescms-bar";

    editButtonElement = document.createElement("a");
    editButtonElement.className = "pagescms-button";
    editButtonElement.setAttribute("aria-label", "Edit entry");
    editButtonElement.setAttribute("title", "Edit entry");
    editButtonElement.target = "_blank";
    editButtonElement.rel = "noreferrer";
    editButtonElement.appendChild(createPencilIcon());

    addButtonElement = createActionButton("Add content", createPlusIcon());
    addButtonElement.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      setMenuVisible(!(menuElement && menuElement.getAttribute("data-open") === "true"));
    });

    closeButtonElement = createActionButton("Close menu", createCloseIcon());
    closeButtonElement.addEventListener("click", function () {
      if (!window.confirm("Hide the Pages CMS menu for this tab?")) return;
      window.PagesCMS.hide();
    });

    barElement.appendChild(editButtonElement);
    barElement.appendChild(addButtonElement);
    barElement.appendChild(closeButtonElement);
    root.appendChild(barElement);
    return barElement;
  }

  function ensureMenu() {
    if (menuElement) return menuElement;

    var root = ensureUiRoot().querySelector(".pagescms-root");
    menuElement = document.createElement("div");
    menuElement.id = "pagescms-admin-menu";
    menuElement.className = "pagescms-menu";
    menuElement.setAttribute("data-open", "false");

    root.appendChild(menuElement);
    return menuElement;
  }

  function setMenuVisible(isVisible) {
    var menu = ensureMenu();
    menu.setAttribute("data-open", isVisible ? "true" : "false");
    if (addButtonElement) {
      addButtonElement.setAttribute("data-open", isVisible ? "true" : "false");
    }
    if (isVisible) {
      positionMenu();
    }
  }

  function positionMenu() {
    if (!menuElement || !addButtonElement) return;

    var rect = addButtonElement.getBoundingClientRect();
    var menuWidth = menuElement.offsetWidth || 120;
    var menuHeight = menuElement.offsetHeight || 0;
    var left = Math.min(rect.right + 8, window.innerWidth - menuWidth - 16);
    left = Math.max(16, left);
    var top = rect.top + (rect.height / 2) - (menuHeight / 2);
    top = Math.max(16, Math.min(top, window.innerHeight - menuHeight - 16));

    menuElement.style.left = left + "px";
    menuElement.style.top = top + "px";
  }

  function renderMenu(bootstrap) {
    var menu = ensureMenu();
    menu.textContent = "";

    var createItems = bootstrap && Array.isArray(bootstrap.create)
      ? bootstrap.create
      : [];
    if (createItems.length === 0) {
      var emptyState = document.createElement("div");
      emptyState.textContent = "No collections available.";
      emptyState.className = "pagescms-empty";
      menu.appendChild(emptyState);
    } else {
      var createGroup = document.createElement("div");
      createGroup.className = "pagescms-items";
      createItems.forEach(function (item) {
        createGroup.appendChild(createMenuItem({
          label: item.label,
          href: cmsOrigin + item.href,
        }));
      });
      menu.appendChild(createGroup);
    }
    positionMenu();
  }

  function loadBootstrap() {
    if (bootstrapData) return Promise.resolve(bootstrapData);
    if (bootstrapPromise) return bootstrapPromise;

    if (!owner || !repo || !branch) {
      bootstrapData = { create: [], routes: [] };
      return Promise.resolve(bootstrapData);
    }

    var endpoint = cmsOrigin
      + "/api/"
      + encodeURIComponent(owner)
      + "/"
      + encodeURIComponent(repo)
      + "/"
      + encodeURIComponent(branch)
      + "/site";

    bootstrapPromise = fetch(endpoint, {
      method: "GET",
      mode: "cors",
    })
      .then(function (response) {
        if (!response.ok) throw new Error("Failed to load site actions.");
        return response.json();
      })
      .then(function (payload) {
        bootstrapData = {
          create: Array.isArray(payload && payload.data && payload.data.create)
            ? payload.data.create
            : [],
          routes: Array.isArray(payload && payload.data && payload.data.routes)
            ? payload.data.routes
            : [],
        };
        return bootstrapData;
      })
      .catch(function () {
        bootstrapData = { create: [], routes: [] };
        return bootstrapData;
      })
      .finally(function () {
        bootstrapPromise = null;
      });

    return bootstrapPromise;
  }

  function syncBarActions() {
    renderMenu(bootstrapData || { create: [], routes: [] });
    ensureBar();

    var editUrl = buildResolvedEditUrl();
    if (editButtonElement) {
      editButtonElement.href = editUrl || buildRepoUrl();
      editButtonElement.hidden = !editUrl;
    }
  }

  function setAdminBarVisible(isVisible) {
    if (isEmbedded) return false;

    if (isVisible) {
      sessionStorage.setItem(sessionKey, "1");
      syncBarActions();
      ensureBar().style.display = "flex";
      return true;
    }

    sessionStorage.removeItem(sessionKey);
    setMenuVisible(false);
    if (barElement) {
      barElement.style.display = "none";
    }
    return false;
  }

  function cleanupActivationFromUrl() {
    var currentUrl = new URL(window.location.href);
    var changed = false;

    if (currentUrl.searchParams.has("pagescms")) {
      currentUrl.searchParams.delete("pagescms");
      changed = true;
    }

    if (currentUrl.hash === "#pagescms" || currentUrl.hash.indexOf("#pagescms=") === 0) {
      currentUrl.hash = "";
      changed = true;
    }

    if (changed) {
      window.history.replaceState(window.history.state, "", currentUrl.toString());
    }
  }

  function activateFromLocation() {
    var url = new URL(window.location.href);
    var hasActivation = url.searchParams.has("pagescms")
      || url.hash === "#pagescms"
      || url.hash.indexOf("#pagescms=") === 0;

    if (!hasActivation) return false;

    setAdminBarVisible(true);
    cleanupActivationFromUrl();
    return true;
  }

  function applyBinding(element, bind, value) {
    if (!element) return;

    switch (bind) {
      case "text":
        element.textContent = value == null ? "" : String(value);
        return;
      case "html":
        element.innerHTML = value == null ? "" : String(value);
        return;
      case "value":
        if ("value" in element) {
          element.value = value == null ? "" : String(value);
        } else {
          element.setAttribute("value", value == null ? "" : String(value));
        }
        return;
      case "src":
        element.setAttribute("src", value == null ? "" : String(value));
        if ("src" in element) {
          element.src = value == null ? "" : String(value);
        }
        return;
      case "href":
        element.setAttribute("href", value == null ? "" : String(value));
        if ("href" in element) {
          element.href = value == null ? "" : String(value);
        }
        return;
      case "checked":
        if ("checked" in element) {
          element.checked = Boolean(value);
        } else if (value) {
          element.setAttribute("checked", "checked");
        } else {
          element.removeAttribute("checked");
        }
        return;
      case "content":
        element.setAttribute("content", value == null ? "" : String(value));
        return;
      default:
        return;
    }
  }

  function hideRepeatedNode(node) {
    if (!node) return;
    if (!node.hasAttribute("data-pagescms-display")) {
      node.setAttribute("data-pagescms-display", node.style.display || "");
    }
    node.style.display = "none";
  }

  function showRepeatedNode(node) {
    if (!node) return;
    var previousDisplay = node.getAttribute("data-pagescms-display");
    node.style.display = previousDisplay == null ? "" : previousDisplay;
  }

  function resolveRepeatedTargets(selector, desiredCount) {
    if (selector.indexOf("{n}") !== -1) {
      var indexedTargets = [];
      for (var index = 0; index < desiredCount; index += 1) {
        var indexedElement = document.querySelector(
          selector.replace(/\{n\}/g, String(index + 1)),
        );
        if (indexedElement) {
          indexedTargets.push(indexedElement);
        }
      }
      return indexedTargets;
    }

    var matchedNodes = Array.prototype.slice.call(
      document.querySelectorAll(selector),
    );

    if (matchedNodes.length === 0) return [];

    if (desiredCount === 0) {
      matchedNodes.forEach(function (node) {
        hideRepeatedNode(node);
      });
      return [];
    }

    var templateNode = matchedNodes[0];
    var parentNode = templateNode.parentElement;

    if (!parentNode) {
      return matchedNodes.slice(0, desiredCount);
    }

    while (matchedNodes.length < desiredCount) {
      var clone = templateNode.cloneNode(true);
      parentNode.appendChild(clone);
      matchedNodes.push(clone);
    }

    matchedNodes.forEach(function (node, index) {
      if (index < desiredCount) {
        showRepeatedNode(node);
      } else {
        hideRepeatedNode(node);
      }
    });

    return matchedNodes.slice(0, desiredCount);
  }

  function applyPreviewBinding(binding) {
    if (!binding || !binding.target || !binding.bind) return;

    if (Array.isArray(binding.value)) {
      var targets = resolveRepeatedTargets(binding.target, binding.value.length);
      if (targets.length === 0 && !warnedPreviewTargets[binding.target]) {
        warnedPreviewTargets[binding.target] = true;
        console.warn("[Pages CMS] Preview target not found:", binding.target);
        postPreviewDebug("warn", "Preview target not found: " + binding.target);
      }
      binding.value.forEach(function (item, index) {
        applyBinding(targets[index], binding.bind, item);
      });
      return targets.length;
    }

    var target = document.querySelector(binding.target);
    if (!target && !warnedPreviewTargets[binding.target]) {
      warnedPreviewTargets[binding.target] = true;
      console.warn("[Pages CMS] Preview target not found:", binding.target);
      postPreviewDebug("warn", "Preview target not found: " + binding.target);
    }
    applyBinding(target, binding.bind, binding.value);
    return target ? 1 : 0;
  }

  function postPreviewDebug(level, message) {
    if (!isEmbedded || !window.parent) return;
    window.parent.postMessage(
      {
        type: "pagescms:preview:debug",
        level: level,
        message: message,
      },
      cmsOrigin,
    );
  }

  function notifyPreviewReady() {
    if (!isEmbedded || !window.parent) return;
    window.parent.postMessage({ type: "pagescms:preview:ready" }, cmsOrigin);
  }

  function handlePreviewMessage(event) {
    if (event.origin !== cmsOrigin) return;

    var data = event.data;
    if (!data || typeof data !== "object") return;

    if (data.type === "pagescms:preview:hello") {
      notifyPreviewReady();
      return;
    }

    if (data.type !== "pagescms:preview:update" || !Array.isArray(data.bindings)) {
      return;
    }

    data.bindings.forEach(function (binding) {
      applyPreviewBinding(binding);
    });
  }

  function initialize() {
    window.PagesCMS = Object.assign({}, window.PagesCMS, {
      toggle: function (nextValue) {
        if (typeof nextValue === "boolean") {
          return setAdminBarVisible(nextValue);
        }
        var isCurrentlyVisible = sessionStorage.getItem(sessionKey) === "1";
        return setAdminBarVisible(!isCurrentlyVisible);
      },
      show: function () {
        return setAdminBarVisible(true);
      },
      hide: function () {
        return setAdminBarVisible(false);
      },
    });

    document.addEventListener("click", function (event) {
      if (!menuElement || menuElement.getAttribute("data-open") !== "true") return;
      var eventPath = typeof event.composedPath === "function"
        ? event.composedPath()
        : [];
      if (eventPath.indexOf(menuElement) !== -1) return;
      if (eventPath.indexOf(barElement) !== -1) return;
      setMenuVisible(false);
    });

    window.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        setMenuVisible(false);
      }
    });

    window.addEventListener("resize", function () {
      if (menuElement && menuElement.getAttribute("data-open") === "true") {
        positionMenu();
      }
    });

    if (!activateFromLocation() && sessionStorage.getItem(sessionKey) === "1") {
      setAdminBarVisible(true);
    }

    loadBootstrap().then(function () {
      syncBarActions();
    });

    window.addEventListener("message", handlePreviewMessage);
    notifyPreviewReady();
    window.addEventListener("load", notifyPreviewReady, { once: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
