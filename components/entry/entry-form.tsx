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
import { labels, fieldTypes, editComponents } from "@/fields/registry";
import {
  initializeState,
  getDefaultValue,
  generateZodSchema,
  sanitizeObject,
  resolveBlocks
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
import { useConfig } from "@/contexts/config-context";
import { toast } from "sonner";
import { z } from 'zod';

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
  blocks
}: {
  control: Control;
  field: Field;
  fieldName: string;
  renderFields: Function;
  blocks: Record<string, any>;
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
                  <SortableItem key={arrayField.id} id={arrayField.id} type={typeof field.type === 'string' ? field.type : "mixed"}>
                    <div className="grid gap-6 flex-1">
                      {typeof field.type === 'string' && field.type === 'object' && field.fields
                        ? renderFields(field.fields, blocks, `${fieldName}.${index}`)
                        : renderSingleField(field, `${fieldName}.${index}`, control, blocks, renderFields, false)}
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

const MixedTypeField = forwardRef((props: any, ref) => {
  const { value, onChange, field, blocks, fieldName, renderFields } = props;
  const types = Array.isArray(field.type) ? field.type : [];
  const selectedType = value?.type || null;

  const handleTypeSelect = (newType: string) => {
    const fieldForResolution: Field = { 
      ...field,
      type: newType,
      list: false,
      fields: undefined
    };

    const resolvedConfig = resolveBlocks(fieldForResolution, blocks);

    let defaultValue: any;
    if (resolvedConfig.type === 'object') {
      defaultValue = initializeState(resolvedConfig.fields, {});
    } else {
      defaultValue = getDefaultValue(resolvedConfig);
    }

    onChange({
      type: newType,
      value: defaultValue
    });
  };

  const handleRemove = () => { onChange(null); };

  const handleInnerChange = (eventOrValue: any) => {
    let newInnerValue: any;

    if (eventOrValue && eventOrValue.target && typeof eventOrValue.target.value !== 'undefined') {
      newInnerValue = eventOrValue.target.value;
    } else if (eventOrValue && eventOrValue.target && typeof eventOrValue.target.checked !== 'undefined') {
       newInnerValue = eventOrValue.target.checked;
    } else {
      newInnerValue = eventOrValue;
    }
    
    if (selectedType && JSON.stringify(newInnerValue) !== JSON.stringify(value?.value)) {
       onChange({ type: selectedType, value: newInnerValue });
    }
  };

  const innerValue = value?.value;
    
  return (
    <div className="space-y-3" ref={ref as React.Ref<HTMLDivElement>}>
      {!selectedType ? (
        <div className="rounded-lg border">
          <header className="flex items-center gap-x-2 rounded-t-lg pl-4 pr-1 h-10 text-sm font-medium">
            <span>Choose content type:</span>
          </header>
          <div className="flex flex-wrap gap-2 p-4">
            {types.map((type: string) => (
              <Button
                key={type}
                type="button"
                variant="secondary"
                size="sm"
                className="gap-x-2"
                onClick={() => handleTypeSelect(type)}
              >
                {
                  fieldTypes.has(type)
                    ? labels[type] || type
                    : blocks?.[type]?.label || type
                }
                <Plus className="h-4 w-4 text-muted-foreground" />
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border">
          <header className="flex items-center gap-x-2 rounded-t-lg pl-4 pr-1 h-10 border-b text-sm font-medium text-muted-foreground">
            {
              fieldTypes.has(selectedType)
                ? labels[selectedType] || selectedType
                : blocks?.[selectedType]?.label || selectedType
            }
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="gap-x-2.5"
                >
                  <Ellipsis className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={handleRemove}>
                  Change content type
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          <div className="p-4">
            {(() => {
              const fieldForResolution = { ...field, type: selectedType };
              const resolvedConfig = resolveBlocks(fieldForResolution, blocks);

              const FieldComponent = typeof resolvedConfig.type === 'string' && resolvedConfig.type !== 'object'
                  ? (editComponents?.[resolvedConfig.type] || editComponents['text'])
                  : null;

              if (resolvedConfig.type === 'object') {
                  return (
                  <div className="grid gap-6">
                      {typeof renderFields === 'function' && Array.isArray(resolvedConfig.fields)
                      ? renderFields(resolvedConfig.fields, blocks, fieldName + ".value")
                      : <p className="text-muted-foreground bg-muted rounded-md px-3 py-2">Error: Cannot render object fields.</p>
                    }
                  </div>
                );
              } else if (FieldComponent) {
                  return (
                  <FieldComponent
                      value={innerValue}
                      onChange={handleInnerChange}
                      field={resolvedConfig}
                      blocks={blocks}
                  />
                );
              } else {
                  return selectedType && <p className="text-muted-foreground bg-muted rounded-md px-3 py-2">Error: Component not found for type &apos;{resolvedConfig.type}&apos;.</p>;
              }
            })()}
          </div>
        </div>
      )}
    </div>
  );
});

MixedTypeField.displayName = 'MixedTypeField';

const renderSingleField = (
  field: Field,
  fieldName: string,
  control: Control,
  blocks: Record<string, any>,
  renderFields: Function,
  showLabel = true
) => {
  const resolvedConfig = resolveBlocks(field, blocks);

  let FieldComponent;
  let isMixedType = false;

  if (Array.isArray(resolvedConfig.type)) {
    FieldComponent = MixedTypeField;
    isMixedType = true;
  } else if (typeof resolvedConfig.type === 'string') {
    if (resolvedConfig.type === 'object') {
      console.error(`renderSingleField should not handle resolved 'object' type directly for: ${fieldName}`);
      return (
        <FormItem>
          <p className="text-muted-foreground bg-muted rounded-md px-3 py-2">Render Error: Object type misrouted.</p>
        </FormItem>
      );
    }
    FieldComponent = editComponents?.[resolvedConfig.type];
    if (!FieldComponent) {
      console.error(`No component found for resolved field type: ${resolvedConfig.type}`);
      FieldComponent = editComponents['text'];
    }
  } else {
     console.error(`Invalid resolved field type for "${fieldName}": ${resolvedConfig.type}`);
     return (
      <FormItem>
        <p className="text-muted-foreground bg-muted rounded-md px-3 py-2">Render Error: Invalid type.</p>
      </FormItem>
    );
  }

  if (!FieldComponent) {
     console.error(`No component found for resolved field type: ${resolvedConfig.type}`);
     return <FormItem><p className="text-xs text-destructive">Render Error: Component missing.</p></FormItem>;
  }

  // Render using the final resolved config and determined component
  return (
    <FormField
      name={fieldName}
      key={fieldName}
      control={control}
      render={({ field: fieldProps }) => (
        <FormItem>
          {showLabel && resolvedConfig.label !== false &&
            <FormLabel className="h-5">
              {resolvedConfig.label || resolvedConfig.name}
            </FormLabel>
          }
          {resolvedConfig.required && <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs font-medium">Required</span>}
          <FormControl>
            <FieldComponent
                {...fieldProps}
                field={resolvedConfig} // Pass resolved finalConfig
                blocks={blocks}
                {...(isMixedType ? { fieldName, renderFields } : {})}
            />
          </FormControl>
          {resolvedConfig.description && <FormDescription>{resolvedConfig.description}</FormDescription>}
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
  blocks,
  contentObject,
  onSubmit = (values) => console.log(values),
  history,
  path,
  options,
}: {
  title: string;
  navigateBack?: string;
  fields: Field[];
  blocks: Record<string, any>;
  contentObject?: any;
  onSubmit: (values: any) => void;
  history?: Record<string, any>[];
  path?: string;
  options: React.ReactNode;
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { config } = useConfig();

  const zodSchema = useMemo(() => {
    return generateZodSchema(fields, blocks, true, config?.object);
  }, [fields, blocks, config?.object]);

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
    blocks: Record<string, any>,
    parentName?: string
  ): React.ReactNode[] => {
    return fields.map((field) => {
      if (!field || field.hidden) return null;
      const currentFieldName = parentName ? `${parentName}.${field.name}` : field.name;

      if (field.list === true || (typeof field.list === 'object' && field.list !== null)) {
        return <ListField key={currentFieldName} control={form.control} field={field} fieldName={currentFieldName} renderFields={renderFields} blocks={blocks} />;
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
              {renderFields(field.fields, blocks, currentFieldName)}
            </div>
          </div>
        );
      }
      return renderSingleField(field, currentFieldName, form.control, blocks, renderFields, true);
    });
  }, [form.control, errors]);

  const handleSubmit = async (values: any) => {
    console.log("handleSubmit", values);
    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleError = (errors: any) => {
    console.log("handleError", errors);
    toast.error("Please fix the errors before saving.", { duration: 5000 });
  };

  // Add a useEffect for testing
  useEffect(() => {
    console.log("Running direct Zod validation test...");
    if (!zodSchema || !fields || !blocks) {
      console.log("Schema, fields, or blocks not ready for test.");
      return;
    }

    try {
      // 1. Full schema is already generated in zodSchema

      // 2. Extract meta schema
      // Ensure zodSchema is a ZodObject before accessing shape
      if (!(zodSchema instanceof z.ZodObject)) {
        console.error("Full schema is not a ZodObject, cannot extract meta schema.");
        return;
      }
      const metaSchema = zodSchema.shape.meta;

      if (!metaSchema) {
        console.error("Meta schema not found in the full schema shape.");
        return;
      }


      // 3. Test data
      const metaData = {
        title: "Test Title", // Use a valid non-empty title
        description: ""      // Empty description as per your example
      };
      console.log("Testing metaData:", metaData);


      // 4. Parse ONLY meta data
      const result = metaSchema.safeParse(metaData);

      console.log("Direct Zod validation result for meta:", JSON.stringify(result, null, 2));

      if (!result.success) {
        console.error("Direct Zod validation errors:", result.error.flatten());
      } else {
        console.log("Direct validation PASSED for meta object.");
      }

    } catch (error) {
      console.error("Error during direct schema extraction/validation:", error);
    }

  }, [zodSchema, fields, blocks]); // Add dependencies

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
              {renderFields(fields, blocks)}
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