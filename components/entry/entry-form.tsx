"use client";

import { useState, useMemo, useEffect, useRef, forwardRef, useCallback } from "react";
import Link from "next/link";
import {
  useForm,
  useFieldArray,
  useFormState,
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
import {
  ChevronLeft,
  GripVertical,
  Loader,
  Plus,
  Trash2,
  Ellipsis,
  ChevronRight,
  Dot,
} from "lucide-react";
import { toast } from "sonner";
import { interpolate } from "@/lib/schema";

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
  field,
  fieldName,
  renderFields,
}: {
  field: Field;
  fieldName: string;
  renderFields: Function;
}) => {
  const isCollapsible = !!(field.list && !(typeof field.list === 'object' && field.list?.collapsible === false));
  
  const { setValue, watch } = useFormContext();
  const { fields: arrayFields, append, remove, move } = useFieldArray({
    name: fieldName,
  });
  const fieldValues = watch(fieldName);
  
  // Use an index-to-state map with a ref to survive re-renders
  const openStatesRef = useRef<boolean[]>([]);
  const [, forceUpdate] = useState({});
  
  useEffect(() => {
    if (openStatesRef.current.length === 0 && arrayFields.length > 0) {
      const defaultCollapsed =
        isCollapsible &&
        typeof field.list === 'object' &&
        field.list.collapsible &&
        typeof field.list.collapsible === 'object' &&
        field.list.collapsible.collapsed;
      
      openStatesRef.current = Array(arrayFields.length).fill(!defaultCollapsed);
      forceUpdate({});
    }
  }, [arrayFields.length, field.list]);
  
  const toggleOpen = (index: number) => {
    if (index >= 0 && index < openStatesRef.current.length) {
      openStatesRef.current[index] = !openStatesRef.current[index];
      forceUpdate({});
    }
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = arrayFields.findIndex(item => item.id === active.id);
      const newIndex = arrayFields.findIndex(item => item.id === over.id);
      
      // Reorder the open states array the same way as the items
      const newOpenStates = [...openStatesRef.current];
      const [movedState] = newOpenStates.splice(oldIndex, 1);
      newOpenStates.splice(newIndex, 0, movedState);
      openStatesRef.current = newOpenStates;
      
      // Perform the move
      move(oldIndex, newIndex);
      
      // Update form values
      const updatedValues = arrayMove(fieldValues, oldIndex, newIndex);
      setValue(fieldName, updatedValues);
      
      // Force update to reflect the reordered open states
      forceUpdate({});
    }
  };

  const addItem = () => {
    append(field.type === 'object'
      ? initializeState(field.fields, {})
      : getDefaultValue(field)
    );
    openStatesRef.current.push(true);
    forceUpdate({});
  };

  const removeItem = (index: number) => {
    remove(index);
    openStatesRef.current.splice(index, 1);
    forceUpdate({});
  };
  
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const modifiers = [restrictToVerticalAxis, restrictToParentElement]

  const toggleAll = (collapsed: boolean) => {
    openStatesRef.current = Array(openStatesRef.current.length).fill(!collapsed);
    forceUpdate({});
  };

  // We don't render <FormMessage/> in ListField, because it's already rendered in the individual fields
  return (
    <FormField
      name={fieldName}
      render={({ field: formField, fieldState: { error } }) => (
        <FormItem>
          <div className="flex items-center h-5 gap-x-2">
            {field.label !== false &&
              <FormLabel className="text-sm font-medium">
                {field.label || field.name}   
              </FormLabel>
            }
            {field.required && (
              <span className="inline-flex items-center rounded-full bg-muted border px-2 h-5 text-xs font-medium">Required</span>
            )}
            
            {
              isCollapsible && arrayFields.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" type="button" size="icon-xs" className="h-5 w-5 text-muted-foreground hover:text-foreground bg-transparent">
                      <Ellipsis className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => toggleAll(true)}>
                      Collapse all
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toggleAll(false)}>
                      Expand all
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            }
          </div>
          <div className="space-y-2">
            <DndContext sensors={sensors} modifiers={modifiers} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={arrayFields.map(item => item.id)} strategy={verticalListSortingStrategy}>
                {arrayFields.map((arrayField, index) => (
                  <SortableItem key={arrayField.id} id={arrayField.id} type={field.type}>
                    <div className="grid gap-6 flex-1">
                      <SingleField
                        field={field}
                        fieldName={`${fieldName}.${index}`}
                        renderFields={renderFields}
                        showLabel={false}
                        isOpen={openStatesRef.current[index]}
                        toggleOpen={() => toggleOpen(index)}
                        index={index}
                      />
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="bg-muted/50 text-muted-foreground self-start" onClick={() => removeItem(index)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        Remove item
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
                  onClick={addItem}
                  className="gap-x-2"
                >
                  <Plus className="h-4 w-4" />
                  Add an item
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
  const { field, fieldName, renderFields, isOpen, onToggleOpen, index } = props;

  const isCollapsible = !!(field.list && !(typeof field.list === 'object' && field.list?.collapsible === false));
  
  const { setValue, watch, formState: { errors } } = useFormContext();
  
  const value = watch(fieldName);
  const onChange = (val: any) => {
    setValue(fieldName, val, { shouldDirty: true });
  }

  const hasErrors = () => {
    let curr: any = errors;
    return fieldName.split('.').every((part: string) => (curr = curr?.[part]) !== undefined) && !!curr;
  };

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

  const fieldValues = watch(fieldName);
  const interpolateData = {
    index: index !== undefined ? `${index + 1}` : '',
    fields: fieldValues,
  }
  const itemLabel = 
    typeof field.list === 'object' && 
    field.list.collapsible && 
    typeof field.list.collapsible === 'object' && 
    field.list.collapsible.summary
      ? interpolate(field.list.collapsible.summary, interpolateData)
      : `Item ${index !== undefined ? `#${index + 1}` : ''}`;

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
        <div className="border rounded-lg">
          <header
            className={cn(
              "flex items-center gap-x-2 px-4 h-10 text-sm font-medium transition-colors rounded-t-lg", 
              isOpen ? 'border-b' : 'rounded-b-lg', 
              isCollapsible ? 'cursor-pointer hover:bg-muted' : ''
            )}
            onClick={isCollapsible ? onToggleOpen : undefined}
          >
            {isCollapsible && (
              <>
                <ChevronRight className={cn("h-4 w-4 transition-transform", isOpen ? 'rotate-90' : '')} />
                <span className={cn('mr-auto', hasErrors() ? 'text-red-500' : '')}>{itemLabel}</span>
              </>
            )}
            <div className="inline-flex items-center gap-x-0.5 text-muted-foreground">
              {selectedBlockDefinition.label || selectedBlockDefinition.name}
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" type="button" size="icon-xs" className="text-muted-foreground hover:text-foreground bg-transparent">
                    <Ellipsis className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={handleRemoveBlock}>
                    Remove block
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <div className={cn("p-4 grid gap-6", isOpen ? '' : 'hidden')}>
            {selectedBlockDefinition.type === 'object' ? (
              (() => {
                const renderedElements = renderFields(
                  selectedBlockDefinition.fields || [],
                  fieldName
                );
                return renderedElements;
              })()
            ) : (
              <SingleField
                field={selectedBlockDefinition}
                fieldName={fieldName}
                renderFields={renderFields}
                showLabel={false}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
});

BlocksField.displayName = 'BlocksField';

const ObjectField = forwardRef((props: any, ref) => {
  const { field, fieldName, renderFields, isOpen = true, onToggleOpen = () => {}, index } = props;
  
  const isCollapsible = !!(field.list && !(typeof field.list === 'object' && field.list?.collapsible === false));

  const { watch, formState: { errors } } = useFormContext();

  const hasErrors = () => {
    let curr: any = errors;
    return fieldName.split('.').every((part: string) => (curr = curr?.[part]) !== undefined) && !!curr;
  };

  const fieldValues = watch(fieldName);
  const interpolateData = {
    index: index !== undefined ? `${index + 1}` : '',
    fields: fieldValues,
  }
  const itemLabel = 
    typeof field.list === 'object' && 
    field.list.collapsible && 
    typeof field.list.collapsible === 'object' && 
    field.list.collapsible.summary
      ? interpolate(field.list.collapsible.summary, interpolateData)
      : `Item ${index !== undefined ? `#${index + 1}` : ''}`;
  
  return (
    <div className="border rounded-lg">
      {isCollapsible && (
        <header className={cn("flex items-center gap-x-2 rounded-t-lg pl-4 pr-1 h-10 text-sm font-medium hover:bg-muted transition-colors cursor-pointer", isOpen ? 'border-b' : 'rounded-b-lg')} onClick={onToggleOpen}>
          <ChevronRight className={cn("h-4 w-4 transition-transform", isOpen ? 'rotate-90' : '')} />
          <span className={hasErrors() ? 'text-red-500' : ''}>{itemLabel}</span>
        </header>
      )}
      <div className={cn("p-4 grid gap-6", isOpen ? '' : 'hidden')}>
        {renderFields(field.fields, fieldName)}
      </div>
    </div>
  );
});

ObjectField.displayName = 'ObjectField';

const SingleField = ({
  field,
  fieldName,
  renderFields,
  showLabel = true,
  isOpen = true,
  toggleOpen = () => {},
  index = 0
}: {
  field: Field;
  fieldName: string;
  renderFields: Function;
  showLabel?: boolean;
  isOpen?: boolean;
  toggleOpen?: () => void;
  index?: number;
}) => {
  const { control, formState: { errors } } = useFormContext();
  
  let FieldComponent;

  const isCollapsible = !!(field.list && !(typeof field.list === 'object' && field.list?.collapsible === false));

  if (field.type === 'block') {
    FieldComponent = BlocksField;
  } else if (field.type === 'object') {
    FieldComponent = ObjectField;
  } else if (typeof field.type === 'string' && editComponents[field.type]) {
    FieldComponent = editComponents[field.type];
  } else {
    console.warn(`No component found for field type: ${field.type}. Defaulting to 'text'.`);
    FieldComponent = editComponents['text'];
  }

  let fieldComponentProps: any = { field: field };
  if (['object', 'block'].includes(field.type)) {
    fieldComponentProps = { ...fieldComponentProps, fieldName, renderFields, isOpen };
    if (isCollapsible) {
      fieldComponentProps = { ...fieldComponentProps, onToggleOpen: toggleOpen, index };
    }
  }
  
  if (['object', 'block'].includes(field.type)) {
    const hasErrors = () => {
      let curr: any = errors;
      return fieldName.split('.').every((part: string) => (curr = curr?.[part]) !== undefined) && !!curr;
    };

    return (
      <FormItem key={fieldName}>
        {showLabel &&
          <div className="flex items-center h-5 gap-x-2">
            {field.label !== false &&
              <FormLabel className={hasErrors() ? "text-red-500" : ""}>
                {field.label || field.name}
              </FormLabel>
            }
            {field.required &&
              <span className="inline-flex items-center rounded-full bg-muted border px-2 h-5 text-xs font-medium">Required</span>
            }
          </div>
        }
        <FieldComponent {...fieldComponentProps} />
        {field.description && <FormDescription>{field.description}</FormDescription>}
      </FormItem>
    );
  } else {
    return (
      <FormField
        name={fieldName}
        key={fieldName}
        control={control}
        render={({ field: rhfManagedFieldProps, fieldState }) => (
          <FormItem>
            <div className="flex items-center h-5 gap-x-2">
              {showLabel && field.label !== false &&
                <FormLabel>
                  {field.label || field.name}
                </FormLabel>
              }
              {showLabel && field.required && <span className="inline-flex items-center rounded-full bg-muted border px-2 h-5 text-xs font-medium">Required</span>}
            </div>
            <FormControl>
              <FieldComponent 
                {...rhfManagedFieldProps}
                {...fieldComponentProps}
              />
            </FormControl>
            {field.description && <FormDescription>{field.description}</FormDescription>}
            <FormMessage />
          </FormItem>
        )}
      />
    );
  }
};

SingleField.displayName = 'SingleField';

const EntryForm = ({
  title,
  navigateBack,
  fields,
  contentObject,
  onSubmit = (values) => console.log("Default onSubmit:", values),
  history,
  path,
  filePath,
  options,
}: {
  title: string;
  navigateBack?: string;
  fields: Field[];
  contentObject?: any;
  onSubmit: (values: any) => void;
  history?: Record<string, any>[];
  path?: string;
  filePath?: React.ReactNode;
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

  const { isDirty } = useFormState({
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
        return <ListField key={currentFieldName} field={field} fieldName={currentFieldName} renderFields={renderFields} />;
      }
      return <SingleField key={currentFieldName} field={field} fieldName={currentFieldName} renderFields={renderFields} />;
    });
  }, []);

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
              {filePath &&
                <div className="space-y-2 overflow-hidden">
                  <FormLabel>
                    Filename
                  </FormLabel>
                  {filePath}
                </div>
              }
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