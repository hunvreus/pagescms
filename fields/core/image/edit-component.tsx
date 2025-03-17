"use client";

import { forwardRef, useCallback, useMemo, useState } from "react";
import { getParentPath } from "@/lib/utils/file";
import { MediaDialog } from "@/components/media/media-dialog";
import { Thumbnail } from "@/components/thumbnail";
import { Button } from "@/components/ui/button";
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
  rectSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Pencil, Trash2, ImagePlus } from "lucide-react";
import { useConfig } from "@/contexts/config-context";

// TODO: disable sortable for single image
// TODO: make component resilient to illegal parentPath

const SortableItem = ({
  id,
  path,
  media,
  children
}: {
  id: string,
  path: string,
  media: string,
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
    transition,
    zIndex: isDragging ? 1000 : "auto"
  };

  // const name = field.options?;

  return (
    <div ref={setNodeRef} style={style}>
      <div className="relative w-28">
        <div {...attributes} {...listeners}>
          <Thumbnail name={media} path={path} className="aspect-square rounded-md outline-none"/>
        </div>
        {children}
      </div>
    </div>
  );
};

const EditComponent = forwardRef((props: any, ref: React.Ref<HTMLInputElement>) => {
  const { value, field, onChange } = props;
  const [images, setImages] = useState<{ id: string, path: string }[]>(() => 
    value
      ? Array.isArray(value)
        ? value.map((path, index) => ({ id: `image-${index}`, path }))
        : [{ id: "image-0", path: value }]
      : []
  );

  const { config } = useConfig();

  const mediaName = field.options?.media || config?.object.media[0].name;
  
  const maxImages = useMemo(() => {
    if (field.list && typeof field.list.max === 'number') {
      return field.list.max;
    }
    return field.list ? undefined : 1;
  }, [field]);

  const handleRemove = useCallback((index: number) => {
    let newImages = [...images];
    newImages.splice(index, 1);
    
    if (newImages.length === 0) {
      setImages([]);
      onChange(field.list ? [] : "");
    } else { 
      setImages(newImages);
      field.list
        ? onChange(newImages.map((item: any) => item.path))
        : onChange(newImages[0].path);
    }
  }, [field, images, onChange]);

  const handleSubmit = useCallback((newImages: string[]) => {
    if (newImages.length === 0) {
      setImages([]);
      onChange(field.list ? [] : "");
    } else {    
      const newImagesObjects = newImages.map((path: string, index: number) => ({ id: `image-${index}`, path }));
      setImages(newImagesObjects);
      field.list
        ? onChange(newImagesObjects.map((item: any) => item.path))
        : onChange(newImagesObjects[0].path);
    }
  }, [field, onChange]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      let newImages = images;
      const oldIndex = newImages.findIndex(item => item.id === active.id);
      const newIndex = newImages.findIndex(item => item.id === over.id);
      newImages = arrayMove(newImages, oldIndex, newIndex);
      setImages(newImages);
      onChange(newImages.map((item: any) => item.path));
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={images} strategy={rectSortingStrategy}>
        {/* <div className="grid grid-flow-col auto-cols-max gap-4"> */}
        <div className="flex flex-wrap gap-4 items-start">

          {images.map((item, index) => 
            <SortableItem key={item.id} id={item.id} path={item.path} media={mediaName}>
              <footer className="absolute bottom-2 right-2">
                <Button type="button" size="icon-xs" variant="outline" className="rounded-r-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:bg-muted" onClick={() => handleRemove(index)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
                <MediaDialog
                  selected={images.map((image: any) => image.path)}
                  onSubmit={handleSubmit}
                  maxSelected={maxImages}
                  initialPath={getParentPath(item.path)}
                >
                  <Button type="button" size="icon-xs" variant="outline" className="rounded-l-none border-l-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:bg-muted">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </MediaDialog>
              </footer>
            </SortableItem>
          )}
          {(!maxImages || images.length < maxImages) && 
            <MediaDialog
              selected={images.map((image: any) => image.path)}
              onSubmit={handleSubmit}
              maxSelected={maxImages}
              initialPath={field.options?.path}
            >
              <Button type="button" variant="outline" className="h-28 w-28">
                <div className="flex flex-col items-center gap-y-1 text-sm">
                  <ImagePlus className="h-5 w-5 stroke-[1.5] text-foreground" />
                  <div>Add image</div>
                </div>
              </Button>
            </MediaDialog>
          }
        </div>
      </SortableContext>
    </DndContext>
  );
});

export { EditComponent };