"use client";

import { MouseEventHandler, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SelectArrowIcon } from "@/components/icons/select-arrow";
import { use } from "passport";

interface SelectProps {
  options: {
    label: string;
    value: string;
    creationDate?: string;
    lastModifiedDate?: string;
    folder?: string | null;
  }[];

  folders?: string[];
  onFolderChange?: (folder: string | null) => void;

  onCreateFolder?: (folderName: string) => void;
  onMoveConversation?: (conversationId: string, folderName: string | null) => void;
  onDeleteFolder?: (folderName: string) => void;
  onDeleteConversation?: (conversationId: string) => void;

  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  onChangeHandleValueChange?: boolean;
  currentFolder?: string | null;
}

/* ---------------------------------------------------
   Time-based grouping logic
----------------------------------------------------- */
const groupConversationsByPeriod = (options: SelectProps["options"]) => {
  const now = new Date();

  const startOfWeek = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - ((now.getUTCDay() + 6) % 7),
      0,
      0,
      0,
      0
    )
  );

  const startOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
  );

  const startOfQuarter = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      Math.floor(now.getUTCMonth() / 3) * 3,
      1,
      0,
      0,
      0,
      0
    )
  );

  const groups: Record<string, typeof options> = {
    "This week": [],
    "This month": [],
    "This quarter": [],
    Older: [],
  };

  options.forEach((option) => {
    if (!option.creationDate) {
      groups["Older"].push(option);
      return;
    }

    const date = new Date(option.creationDate);
    const utcDate = new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        date.getUTCHours(),
        date.getUTCMinutes(),
        date.getUTCSeconds(),
        date.getUTCMilliseconds()
      )
    );

    if (utcDate >= startOfWeek) groups["This week"].push(option);
    else if (utcDate >= startOfMonth) groups["This month"].push(option);
    else if (utcDate >= startOfQuarter) groups["This quarter"].push(option);
    else groups["Older"].push(option);
  });

  return groups;
};

/* ---------------------------------------------------
   Main Select Component
----------------------------------------------------- */
const UserSelect = ({
  options,
  folders = [],
  currentFolder = null,
  onFolderChange,
  onCreateFolder,
  onMoveConversation,
  onDeleteFolder,
  onDeleteConversation,

  value,
  onChange,
  placeholder = "Select an element",
  className,
}: SelectProps) => {
  const [showOptions, setShowOptions] = useState(false);
  const [selectedValue, setSelectedValue] = useState<string | undefined>(value);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);

  // Drag and drop visual state
  const [dragTarget, setDragTarget] = useState<string | null | undefined>(undefined);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);

  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const optionsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSelectedValue(value);
  }, [value]);

  useEffect(() => {
    setActiveFolder(currentFolder ?? null);
  }, [currentFolder]);

  const toggleDropdown = () => setShowOptions((prev) => !prev);
  const closeDropdown = () => setShowOptions(false);

  const handleSelectElementClick = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>
  ) => {
    if (!containerRef.current || !optionsRef.current) return;
    if (
      event.target instanceof Element &&
      optionsRef.current.contains(event.target)
    )
      return;

    toggleDropdown();
  };

  const handleOptionClick = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
    optionValue: string
  ) => {
    setSelectedValue(optionValue);
    if (onChange) onChange(optionValue);
    closeDropdown();
  };

  /* ---------------------------------------------------
     Folder switching
  ----------------------------------------------------- */
  const handleFolderClick = (folder: string | null) => {
    console.log("Switching to folder:", folder);
    console.log
    setActiveFolder(folder);
    if (onFolderChange) onFolderChange(folder);
  };

  const handleWindowClick = (event: MouseEvent) => {
    if (!containerRef.current) return;
    if (
      event.target instanceof Element &&
      !containerRef.current.contains(event.target)
    ) {
      closeDropdown();
    }
  };

  useEffect(() => {
    window.addEventListener("click", handleWindowClick);
    return () => window.removeEventListener("click", handleWindowClick);
  }, []);

  /* ---------------------------------------------------
     Drag and Drop Logic
  ----------------------------------------------------- */
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, conversationId: string) => {
    e.dataTransfer.setData("conversationId", conversationId);
    setDraggedItem(conversationId);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragTarget(undefined);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, targetFolder: string | null) => {
    e.preventDefault(); // Allow dropping
    setDragTarget(targetFolder);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetFolder: string | null) => {
    e.preventDefault();
    const conversationId = e.dataTransfer.getData("conversationId");
    if (conversationId && onMoveConversation) {
      onMoveConversation(conversationId, targetFolder);
    }
    setDragTarget(undefined);
    setDraggedItem(null);
  };

  /* ---------------------------------------------------
     Filter or group
  ----------------------------------------------------- */
  const filteredOptions =
    currentFolder === null
      ? options
      : options.filter((o) => o.folder === currentFolder);
  console.log("Filtered Options:", filteredOptions);

  const groupedOptions = groupConversationsByPeriod(filteredOptions);

  /* ---------------------------------------------------
     Create folder
  ----------------------------------------------------- */
  const createFolder = () => {
    if (!newFolderName.trim()) return;
    if (onCreateFolder) onCreateFolder(newFolderName.trim());
    setNewFolderName("");
    setIsCreatingFolder(false);
    // DO NOT do: folders.push(newFolderName.trim());
  };

  /* ---------------------------------------------------
   Conversation Option Component
  ----------------------------------------------------- */
  const UserOption = ({
    label,
    value,
    onClick,
    isSelected,
    onDragStart,
    onDragEnd,
    isDragging,
  }: {
    label: string;
    value: string;
    onClick: MouseEventHandler<HTMLDivElement>;
    isSelected?: boolean;
    onDragStart?: (e: React.DragEvent<HTMLDivElement>, value: string) => void;
    onDragEnd?: () => void;
    isDragging?: boolean;
  }) => {
    return (
      <div
        className={cn(
          "flex items-center justify-between px-3 py-2 transition cursor-pointer group",
          isSelected ? "bg-blue-100 hover:bg-blue-100" : "hover:bg-gray-100",
          isDragging && "opacity-50"
        )}
        draggable={!!onDragStart}
        onDragStart={(e) => onDragStart && onDragStart(e, value)}
        onDragEnd={onDragEnd}
        onClick={onClick}
      >
        <div className="flex items-center gap-3 flex-1">
          <span className="flex items-center justify-start w-6">
            <span
              className={cn(
                "inline-block h-3 w-3 rounded-full",
                isSelected ? "bg-green-500" : "bg-red-500"
              )}
            ></span>
          </span>

          <span className="text-sm break-all">{label}</span>
        </div>

        {/* Delete conversation icon */}
        <button
          className="opacity-0 group-hover:opacity-100 transition-all text-red-600 font-bold text-lg ml-2
                    rounded-lg px-1 hover:bg-red-100 hover:text-red-700"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteConversation?.(value); // ou handleDeleteConversation(value)
          }}
        >
          ✕
        </button>

      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "w-full text-sm relative h-[36px]",
        showOptions ? "overflow-visible" : "overflow-hidden",
        "z-[60]"
      )}
      onClick={handleSelectElementClick}
    >
      {/* Header */}
      <div
        className={cn(
          "w-full h-[36px] shrink-0 rounded-[6px] flex items-center justify-between px-[10px] bg-white border border-gray-light hover:border-secondary cursor-pointer",
          showOptions && "!border-primary",
          className
        )}
      >
        <span className="text-text break-all">
          {activeFolder ? `[${activeFolder}]` : placeholder}
        </span>
        <SelectArrowIcon
          width={8}
          height={8}
          className={cn(
            "transition-transform duration-300 rotate-0 fill-gray-dark",
            showOptions && "rotate-180 fill-primary"
          )}
        />
      </div>

      {/* Dropdown */}
      <div
        ref={optionsRef}
        className={cn(
          "absolute left-0 bottom-full w-full mb-2 z-[65]",
          "flex flex-col py-2 gap-1 bg-white text-text max-h-[50vh] overflow-y-auto rounded-[6px] shadow-md border border-gray-100",
          showOptions
            ? "opacity-100 translate-y-0 visible"
            : "opacity-0 translate-y-2 invisible pointer-events-none"
        )}
      >
        {/* ---------------------------------------------------
            Folders
        ----------------------------------------------------- */}
        <div className="flex flex-col gap-1">
          <div className="px-3 py-1 text-[11px] uppercase font-semibold text-gray-500 bg-gray-50">
            Folders
          </div>

          <div
            className={cn(
              "px-3 py-2 cursor-pointer hover:bg-gray-100 transition-colors duration-200",
              activeFolder === null && "bg-blue-50",
              dragTarget === null && "bg-blue-200 ring-2 ring-inset ring-blue-400"
            )}
            onClick={() => handleFolderClick(null)}
            onDragOver={(e) => handleDragOver(e, null)}
            onDrop={(e) => handleDrop(e, null)}
          >
            All conversations
          </div>

          {folders.map((folder) => (
            <div
              key={folder}
              className={cn(
                "group px-3 py-2 cursor-pointer flex items-center justify-between hover:bg-gray-100 transition-colors duration-200",
                activeFolder === folder && "bg-blue-100",
                dragTarget === folder && "bg-blue-200 ring-2 ring-inset ring-blue-400"
              )}
              onClick={() => handleFolderClick(folder)}
              onDragOver={(e) => handleDragOver(e, folder)}
              onDrop={(e) => handleDrop(e, folder)}
            >
              <span>{folder}</span>

              {/* Delete folder button */}
              <button
                className="opacity-0 group-hover:opacity-100 transition-all text-red-600 font-bold text-lg ml-2
                          rounded-lg px-1 hover:bg-red-100 hover:text-red-700"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFolder?.(folder);
                }}
              >
                ✕
              </button>
            </div>
          ))}


          {!isCreatingFolder && (
            <div
              className="px-3 py-2 text-blue-600 cursor-pointer hover:bg-gray-100"
              onClick={(e) => {
                e.stopPropagation();
                setIsCreatingFolder(true);
              }}
            >
              + Add folder
            </div>
          )}

          {isCreatingFolder && (
            <div className="flex items-center gap-2 px-3 pb-2">
              <input
                className="border px-2 py-1 rounded w-full"
                placeholder="Folder name"
                value={newFolderName}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setNewFolderName(e.target.value)}
              />
              <button
                className="text-blue-600 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  createFolder();
                }}
              >
                Add
              </button>
              <button
                className="text-gray-500 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCreatingFolder(false);
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* ---------------------------------------------------
            TIME GROUPS
        ----------------------------------------------------- */}
        {Object.entries(groupedOptions).map(([groupLabel, groupItems]) => {
          if (groupItems.length === 0) return null;

          return (
            <div key={groupLabel} className="flex flex-col gap-1">
              <div className="px-3 py-1 text-[11px] uppercase font-semibold text-gray-500 bg-gray-50">
                {groupLabel}
              </div>

              {groupItems.map((option) => (
                <UserOption
                  key={option.value}
                  label={option.label}
                  value={option.value}
                  isSelected={option.value === selectedValue}
                  onClick={(event) => handleOptionClick(event, option.value)}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  isDragging={draggedItem === option.value}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export { UserSelect };
