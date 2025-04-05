"use client";

import { useState, useMemo, useEffect, useRef, forwardRef } from "react";
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
import { ChevronLeft, GripVertical, Loader, Plus, Trash2, X } from "lucide-react";

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
    transform: CSS.Transform.toString(transform),
    transition
  };
  // type === "object" ? "px-2 py-4" : "px-1 py-2"
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
  renderFields: (fields: Field[], parentName?: string) => React.ReactNode;
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
                      {typeof field.type === 'string' && field.type === "object" && field.fields
                        ? renderFields(field.fields, `${fieldName}.${index}`)
                        : renderSingleField(field, `${fieldName}.${index}`, control, false)}
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
            {typeof field.list === "object" && field.list?.max && arrayFields.length >= field.list.max
              ? null
              : <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    append(field.type === "object"
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
          </div>
        </FormItem>
      )}
    />
  );
};

const MixedTypeField = forwardRef((props: any, ref) => {
  // Rename props from RHF for clarity
  const { value: rhfValue, onChange: rhfOnChange, field } = props;
  const types = Array.isArray(field.type) ? field.type : []; // Get the possible types

  // Derive selectedType from the RHF value structure { type, value }
  const selectedType = rhfValue?.type || null;

  // Called when a type button is clicked
  const handleTypeSelect = (newType: string) => {
    // Create minimal config for default value lookup
    const minimalFieldConfig = { ...field, type: newType, list: false, fields: undefined };
    rhfOnChange({ // Update RHF state
      type: newType,
      value: getDefaultValue(minimalFieldConfig)
    });
  };

  // Called when the remove button is clicked
  const handleRemove = () => {
    rhfOnChange(null); // Reset RHF state for this field
  };

  // onChange handler passed to the inner FieldComponent
  const handleInnerChange = (eventOrValue: any) => {
    let newInnerValue: any;

    // Simple check: If it has a 'target' and 'target.value', assume it's an event.
    if (eventOrValue && eventOrValue.target && typeof eventOrValue.target.value !== 'undefined') {
      newInnerValue = eventOrValue.target.value;
    // Simple check for checkbox event
    } else if (eventOrValue && eventOrValue.target && typeof eventOrValue.target.checked !== 'undefined') {
       newInnerValue = eventOrValue.target.checked;
    }
     else {
      // Otherwise, assume the argument *is* the value.
      newInnerValue = eventOrValue;
    }

    // Construct the new outer value for RHF { type, value }
    const newOuterValue = {
      type: selectedType,
      value: newInnerValue // Use the extracted value
    };

    // Compare the extracted inner value with the existing inner value
    if (selectedType && JSON.stringify(newInnerValue) !== JSON.stringify(rhfValue?.value)) {
       rhfOnChange(newOuterValue); // Update RHF with the full object
    }
  };

  // Get the specific component for the selected type
  const FieldComponent = selectedType ? (editComponents?.[selectedType] || editComponents["text"]) : null;

  // Determine the value to pass down
  const innerValue = rhfValue?.value ?? getDefaultValue({ ...field, type: selectedType, list: false, fields: undefined });

  return (
    <div className="space-y-3" ref={ref as React.Ref<HTMLDivElement>}>
      {!selectedType ? (
        // State 1: Show type selection buttons
        <div className="flex flex-wrap gap-2">
          {types.map((type: string) => (
            <Button key={type} type="button" variant="outline" size="sm" onClick={() => handleTypeSelect(type)}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </Button>
          ))}
        </div>
      ) : (
        // State 2: Show selected type's form in a fieldset
        <div className="rounded-lg border">
          <header className="flex items-center justify-between gap-x-2 rounded-t-lg pl-4 pr-1 h-9 border-b text-muted-foreground">
            <span className="flex items-center gap-x-2 capitalize text-sm font-medium">{selectedType}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon-sm" className="hover:bg-transparent" onClick={handleRemove}>
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove field</TooltipContent>
            </Tooltip>
          </header>
          <div className="p-4">
            {FieldComponent && (
              <FieldComponent
                value={innerValue}
                onChange={handleInnerChange}
                // Pass field config with the *selected* type
                field={{...field, type: selectedType}}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
});

const renderSingleField = (
  field: Field,
  fieldName: string,
  control: Control,
  showLabel = true
) => {
  if (!Array.isArray(field.type) && typeof field.type !== 'string') {
    console.error(`Invalid field type: ${field.type}`);
    return null;
  }
  let FieldComponent;

  if (typeof field.type === 'string') {
    if (editComponents?.[field.type]) {
      FieldComponent = editComponents[field.type];
    } else {
      console.warn(`No component found for field type: ${field.type}. Switching to text.`);
      FieldComponent = editComponents["text"];
    }
  } else {
    FieldComponent = MixedTypeField;
  }

  return (
    <FormField
      name={fieldName}
      key={fieldName}
      control={control}
      render={({ field: fieldProps }) => (
        <FormItem>
          {showLabel && field.label !== false &&
            <FormLabel className="h-5">
              {field.label || field.name}
            </FormLabel>
          }
          {field.required && <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs font-medium">Required</span>}
          <FormControl>
            <FieldComponent {...fieldProps} field={field} />
          </FormControl>
          {field.description && <FormDescription>{field.description}</FormDescription>}
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
  onSubmit = (values) => console.log(values),
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
    return generateZodSchema(fields, true);
  }, [fields]);

  const defaultValues = useMemo(() => {
    return initializeState(fields, sanitizeObject(contentObject));
  }, [fields, contentObject]);

  const form = useForm({
    resolver: zodSchema && zodResolver(zodSchema),
    defaultValues,
  });

  const { isDirty } = useFormState({
    control: form.control
  });

  // TODO: investigate why this run on every input focus
  const renderFields = (fields: Field[], parentName?: string) => {
    return fields.map((field) => {
      if (field.hidden) return null;

      const fieldName = parentName ? `${parentName}.${field.name}` : field.name;

      if (field.list) {
        return <ListField key={fieldName} control={form.control} field={field} fieldName={fieldName} renderFields={renderFields} />;
      } else if (field.type === "object") {
        return (
          <fieldset key={fieldName} className="grid gap-6 rounded-lg border p-4">
            {field.label !== false &&
              <legend className="text-sm font-medium leading-none">
                {field.label || field.name}
                {field.required && <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs font-medium">Required</span>}
              </legend>
            }
            {renderFields(field.fields || [], fieldName)}
          </fieldset>
        );
      }

      return renderSingleField(field, fieldName, form.control);
    });
  };

  const handleSubmit = async (values: any) => {
    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)}>
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