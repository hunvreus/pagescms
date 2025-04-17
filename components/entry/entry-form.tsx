"use client";

import { useState, useMemo, useEffect, useRef, forwardRef, useCallback } from "react";
import Link from "next/link";
import {
  useForm,
  useFieldArray,
  useFormState,
  Control,
  useFormContext
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { editComponents } from "@/fields/registry";
import {
  initializeState,
  getDefaultValue,
  generateZodSchema,
  sanitizeObject
} from "@/lib/schema";
import { Field } from "@/types/field";
import { EntryHistoryBlock, EntryHistoryDropdown } from "./entry-history";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  restrictToVerticalAxis,
  restrictToParentElement
} from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { ChevronLeft, GripVertical, Loader, Plus, Trash2, Ellipsis } from "lucide-react";
import { toast } from "sonner";
const SortableItem = ({
  id,
  type,
  children
}: {
  id: string,
  type: string,
  children: React.ReactNode
}) => {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition
  };
  
  return (
    <div ref={setNodeRef} className={cn("flex gap-x-2 items-center", isDragging ? "opacity-50 z-50" : "z-10")} style={style}>
      <Button type="button" variant="ghost" size="icon-sm" className="h-auto w-5 bg-muted/50 self-stretch rounded-md text-muted-foreground cursor-move" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4" />
      </Button>
      {children}
    </div>
  );
};

const ListField = ({
  control,
  field,
  fieldName,
  renderFields,
}: {
  control: Control;
  field: Field;
  fieldName: string;
  renderFields: Function;
}) => {
  const { fields: arrayFields, append, remove, move } = useFieldArray({
    control,
    name: fieldName,
  });
  // TODO: why is this not used?
  const { errors } = useFormState({ control });

  const { setValue, watch } = useFormContext();
  const fieldValues = watch(fieldName);

  const hasAppended = useRef(false);

  useEffect(() => {
    if ((field.list && typeof field.list === 'object' && field.list.min === undefined) || field.list === true) {
      return;
    }

    const defaultValue = getDefaultValue(field);

    if (arrayFields.length === 0 && !hasAppended.current && defaultValue) {
      append(defaultValue);
      hasAppended.current = true;
    }
  }, [arrayFields, append, field]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const modifiers = [restrictToVerticalAxis, restrictToParentElement]

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = arrayFields.findIndex((item) => item.id === active.id);
      const newIndex = arrayFields.findIndex((item) => item.id === over.id);
      move(oldIndex, newIndex);

      const updatedValues = arrayMove(fieldValues, oldIndex, newIndex);
      setValue(fieldName, updatedValues);
    }
  };
  
  // We don't render <FormMessage/> in ListField, because it's already rendered in the individual fields
  return (
    <FormField
      name={fieldName}
      control={control}
      render={({ field: formField, fieldState: { error } }) => (
        <FormItem>
          {field.label !== false &&
            <FormLabel className="text-sm font-medium">
              {field.label || field.name}
            </FormLabel>
          }
          {field.required && (
            <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs font-medium">Required</span>
          )}
          <div className="space-y-2">
            <DndContext sensors={sensors} modifiers={modifiers} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={arrayFields.map(item => item.id)} strategy={verticalListSortingStrategy}>
                {arrayFields.map((arrayField, index) => (
                  <SortableItem key={arrayField.id} id={arrayField.id} type={field.type}>
                    <div className="grid gap-6 flex-1">
                      {field.type === 'object' && field.fields
                        ? renderFields(field.fields, `${fieldName}.${index}`)
                        : renderSingleField(field, `${fieldName}.${index}`, control, renderFields, false)}
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button type="button" variant="ghost" size="icon-sm" className="bg-muted/50 text-muted-foreground self-start" onClick={() => remove(index)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        Remove entry
                      </TooltipContent>
                    </Tooltip>
                  </SortableItem>
                ))}
              </SortableContext>
            </DndContext>
            {typeof field.list === 'object' && field.list?.max && arrayFields.length >= field.list.max
              ? null
              : <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    append(field.type === 'object'
                      ? initializeState(field.fields, {})
                      : getDefaultValue(field)
                    );
                  }}
                  className="gap-x-2"
                >
                  <Plus className="h-4 w-4" />
                  Add an entry
                </Button>
            }
            <FormMessage />
          </div>
        </FormItem>
      )}
    />
  );
};

const BlocksField = forwardRef((props: any, ref) => {
  const { value, onChange } = props;
  const { field, fieldName, renderFields, control } = props;

  const { blocks = [] } = field;
  const blockKey = field.blockKey || "_block";
  const selectedBlockName = value?.[blockKey];

  const handleBlockSelect = (blockName: string) => {
    const selectedBlockDef = blocks.find((b: Field) => b.name === blockName);
    if (!selectedBlockDef) return;
    let initialState: Record<string, any> = { [blockKey]: blockName };
    if (selectedBlockDef.fields) {
      const choiceDefaults = initializeState(selectedBlockDef.fields, {});
      initialState = { ...initialState, ...choiceDefaults };
    }
    onChange(initialState);
  };

  const handleRemoveBlock = () => {
    onChange(null);
  };

  const selectedBlockDefinition = useMemo(() => {
    const definition = blocks.find((b: Field) => b.name === selectedBlockName);
    return definition;
  }, [blocks, selectedBlockName]);

  return (
    <div className="space-y-3" ref={ref as React.Ref<HTMLDivElement>}>
      {!selectedBlockDefinition ? (
        <div className="rounded-lg border">
          <header className="flex items-center gap-x-2 rounded-t-lg pl-4 pr-1 h-10 text-sm font-medium">
            <span>Choose content block:</span>
          </header>
          <div className="flex flex-wrap gap-2 p-4">
            {blocks.map((blockDef: Field) => (
              <Button
                key={blockDef.name}
                type="button"
                variant="secondary"
                size="sm"
                className="gap-x-2"
                onClick={() => handleBlockSelect(blockDef.name)}
              >
                {blockDef.label || blockDef.name}
                <Plus className="h-4 w-4 text-muted-foreground" />
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border">
          <header className="flex items-center gap-x-2 rounded-t-lg pl-4 pr-1 h-10 border-b text-sm font-medium text-muted-foreground">
            {selectedBlockDefinition.label || selectedBlockDefinition.name}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon-xs">
                  <Ellipsis className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={handleRemoveBlock}>
                  Remove block
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          <div className="p-4 grid gap-6">
            {selectedBlockDefinition.type === 'object' ? (
              (() => {
                const renderedElements = renderFields(
                  selectedBlockDefinition.fields || [],
                  fieldName
                );
                return renderedElements;
              })()
            ) : (
              (() => {
                 const renderedElement = renderSingleField(
                    selectedBlockDefinition,
                    fieldName,
                    control,
                    renderFields,
                    false
                 );
                 return renderedElement;
              })()
            )}
          </div>
        </div>
      )}
    </div>
  );
});

BlocksField.displayName = 'BlocksField';

const renderSingleField = (
  field: Field,
  fieldName: string,
  control: Control,
  renderFields: Function,
  showLabel = true
) => {
  const fieldConfig = field;
  let FieldComponent;

  if (fieldConfig.type === 'block') {
    FieldComponent = BlocksField;
  } else if (fieldConfig.type === 'object') {
    console.error(`renderSingleField should not handle 'object' type directly for: ${fieldName}`);
    return (
      <FormItem key={fieldName}>
        <p className="text-muted-foreground bg-muted rounded-md px-3 py-2">Render Error: Object type misrouted.</p>
      </FormItem>
    );
  } else if (typeof fieldConfig.type === 'string' && editComponents[fieldConfig.type]) {
    FieldComponent = editComponents[fieldConfig.type];
  } else {
    console.warn(`No component found for field type: ${fieldConfig.type}. Defaulting to 'text'.`);
    FieldComponent = editComponents['text'];
  }

  return (
    <FormField
      name={fieldName}
      key={fieldName}
      control={control}
      render={({ field: rhfFieldProps, fieldState }) => (
        <FormItem>
          {showLabel && fieldConfig.label !== false &&
            <FormLabel className="h-5">
              {fieldConfig.label || fieldConfig.name}
            </FormLabel>
          }
          {showLabel && fieldConfig.required && <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs font-medium">Required</span>}
          <FormControl>
            <FieldComponent
              {...rhfFieldProps}
              field={fieldConfig}
              {...(fieldConfig.type === 'block' ? { fieldName, renderFields, control } : {})}
            />
          </FormControl>
          {fieldConfig.description && <FormDescription>{fieldConfig.description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

const EntryForm = ({
  title,
  navigateBack,
  fields,
  contentObject,
  onSubmit = (values) => console.log("Default onSubmit:", values),
  history,
  path,
  options,
}: {
  title: string;
  navigateBack?: string;
  fields: Field[];
  contentObject?: any;
  onSubmit: (values: any) => void;
  history?: Record<string, any>[];
  path?: string;
  options: React.ReactNode;
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const zodSchema = useMemo(() => {
    return generateZodSchema(fields);
  }, [fields]);

  const defaultValues = useMemo(() => {
    return initializeState(fields, sanitizeObject(contentObject));
  }, [fields, contentObject]);

  const form = useForm({
    resolver: zodSchema && zodResolver(zodSchema),
    defaultValues,
    reValidateMode: "onSubmit"
  });

  const { isDirty, errors } = useFormState({
    control: form.control
  });

  const renderFields = useCallback((
    fields: Field[],
    parentName?: string
  ): React.ReactNode[] => {
    return fields.map((field) => {
      if (!field || field.hidden) return null;
      const currentFieldName = parentName ? `${parentName}.${field.name}` : field.name;

      if (field.list === true || (typeof field.list === 'object' && field.list !== null)) {
        return <ListField key={currentFieldName} control={form.control} field={field} fieldName={currentFieldName} renderFields={renderFields} />;
      } else if (field.type === "object" && Array.isArray(field.fields)) {
        const objectErrors = errors?.[currentFieldName];
        const hasNestedErrors = typeof objectErrors === 'object' && objectErrors !== null && Object.keys(objectErrors).length > 0;

        return (
          <div className="rounded-lg border" key={currentFieldName}>
            {field.label !== false &&
              <header className={cn(
                "flex items-center gap-x-2 rounded-t-lg pl-4 pr-1 h-10 border-b text-sm font-medium bg-muted",
                hasNestedErrors && "text-red-500"
              )}>
                {field.label || field.name}
                {field.required && <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs font-medium">Required</span>}
              </header>
            }
            <div className="grid gap-6 p-4">
              {renderFields(field.fields, currentFieldName)}
            </div>
          </div>
        );
      }
      return renderSingleField(field, currentFieldName, form.control, renderFields, true);
    });
  }, [form.control, errors]);

  const handleSubmit = async (values: any) => {
    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleError = (errors: any) => {
    toast.error("Please fix the errors before saving.", { duration: 5000 });
  };

  return (
    <Form {...form}>
      <pre>{JSON.stringify(form.watch(), null, 2)}</pre>
      <form onSubmit={form.handleSubmit(handleSubmit, handleError)}>
        <div className="max-w-screen-xl mx-auto flex w-full gap-x-8">
          <div className="flex-1 w-0">
            <header className="flex items-center mb-6">
              {navigateBack &&
                <Link
                  className={cn(buttonVariants({ variant: "outline", size: "icon-xs" }), "mr-4 shrink-0")}
                  href={navigateBack}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Link>
              }

              <h1 className="font-semibold text-lg md:text-2xl truncate">{title}</h1>
            </header>
            <div onSubmit={form.handleSubmit(handleSubmit)} className="grid items-start gap-6">
              {renderFields(fields)}
            </div>
          </div>

          <div className="hidden lg:block w-64">
            <div className="flex flex-col gap-y-4 sticky top-0">
              <div className="flex gap-x-2">
                <Button type="submit" className="w-full" disabled={isSubmitting || !isDirty}>
                  Save
                  {isSubmitting && (<Loader className="ml-2 h-4 w-4 animate-spin" />)}
                </Button>
                {options ? options : null}
              </div>
              {path && history && <EntryHistoryBlock history={history} path={path} />}
            </div>
          </div>
          <div className="lg:hidden fixed top-0 right-0 h-14 flex items-center gap-x-2 z-10 pr-4 md:pr-6">
            {path && history && <EntryHistoryDropdown history={history} path={path} />}
            <Button type="submit" disabled={isSubmitting}>
              Save
              {isSubmitting && (<Loader className="ml-2 h-4 w-4 animate-spin" />)}
            </Button>
            {options ? options : null}
          </div>
        </div>
      </form>
    </Form>
  );
};

export { EntryForm }