"use client";

import { MouseEventHandler, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SelectArrowIcon } from "@/components/icons/select-arrow";

interface SelectProps {
  options: {
    label: string;
    value: string;
    creationDate?: string;
    lastModifiedDate?: string;
  }[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  onChangeHandleValueChange?: boolean;
}

// Composant pour chaque option
const UserOption = ({
  label,
  value,
  onClick,
  isSelected,
}: {
  label: string;
  value: string;
  onClick: MouseEventHandler<HTMLDivElement>;
  isSelected?: boolean;
}) => {
  return (
    <div
      className={cn(
        "w-full cursor-pointer flex items-center gap-3 px-3 py-2 text-black break-all transition",
        isSelected ? "bg-blue-100 hover:bg-blue-100" : "hover:bg-gray-100"
      )}
      onClick={onClick}
    >
      <span className="flex items-center justify-start w-6">
        <span
          className={cn(
            "inline-block h-3 w-3 rounded-full",
            isSelected ? "bg-green-500" : "bg-red-500"
          )}
        ></span>
      </span>
      <span className="flex-1 text-left text-sm">{label}</span>
    </div>
  );
};

const groupConversationsByPeriod = (options: SelectProps["options"]) => {
  const now = new Date();

  // Define the start of the week, month, and quarter in UTC
  const startOfWeek = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - ((now.getUTCDay() + 6) % 7), // Monday as the first day of the week
    0, 0, 0, 0
  ));

  const startOfMonth = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    1,
    0, 0, 0, 0
  ));

  const startOfQuarter = new Date(Date.UTC(
    now.getUTCFullYear(),
    Math.floor(now.getUTCMonth() / 3) * 3,
    1,
    0, 0, 0, 0
  ));

  const groups: Record<string, typeof options> = {
    "This week": [],
    "This month": [],
    "This quarter": [],
    "Older": [],
  };

  options.forEach((option) => {
    if (!option.creationDate) {
      groups["Older"].push(option);
      return;
    }

    const date = new Date(option.creationDate);
    const utcDate = new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    ));

    if (utcDate >= startOfWeek) {
      groups["This week"].push(option);
    } else if (utcDate >= startOfMonth) {
      groups["This month"].push(option);
    } else if (utcDate >= startOfQuarter) {
      groups["This quarter"].push(option);
    } else {
      groups["Older"].push(option);
    }
  });

  // Retourne les groupes
  return groups;
};


const UserSelect = ({
  options,
  value,
  onChange,
  placeholder = "Select an element",
  className,
  onChangeHandleValueChange,
}: SelectProps) => {
  const [showOptions, setShowOptions] = useState(false);
  const [selectedValue, setSelectedValue] = useState<string | undefined>(value);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const optionsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSelectedValue(value);
  }, [value]);

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
    closeDropdown();
    setSelectedValue(optionValue);
    if (onChange) onChange(optionValue);
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

  const groupedOptions = groupConversationsByPeriod(options);

  return (
    <div
      ref={containerRef}
      className={cn(
        "w-full text-sm relative h-[36px]",
        showOptions ? "overflow-visible" : "overflow-hidden",
        "transition-none",
        "z-[60]"
      )}
      onClick={handleSelectElementClick}
    >
      {/* Header */}
      <div
        className={cn(
          "w-full h-[36px] shrink-0 rounded-[6px] flex items-center justify-between px-[10px] bg-white border border-gray-light hover:border-secondary cursor-pointer",
          "transition-colors duration-200 ease-in-out",
          showOptions && "!border-primary",
          className,
          "z-[9999] sticky top-0"
        )}
      >
        <span className="text-text break-all">{placeholder}</span>
        <SelectArrowIcon
          width={8}
          height={8}
          className={cn(
            "transition-transform duration-300 ease-in-out rotate-0 fill-gray-dark",
            showOptions && "rotate-180 fill-primary"
          )}
        />
      </div>

      {/* Dropdown */}
      <div
        ref={optionsRef}
        className={cn(
          "absolute left-0 bottom-full w-full mb-2 z-[65]",
          "flex flex-col py-2 gap-1 bg-white text-text max-h-[50vh] overflow-y-auto rounded-[6px] shadow-[0px_6px_18px_rgba(0,0,0,0.06)] border border-gray-100",
          "transition-opacity transition-transform duration-200 ease-out",
          showOptions
            ? "opacity-100 translate-y-0 visible"
            : "opacity-0 translate-y-2 invisible pointer-events-none"
        )}
      >
        {Object.entries(groupedOptions).map(([groupLabel, groupItems]) => {
        if (groupItems.length === 0) return null;
        return (
            <div key={groupLabel} className="flex flex-col gap-1">
            <div className="px-3 py-1 text-[11px] uppercase font-semibold text-gray-500 bg-gray-50">
                {groupLabel}
            </div>
            {groupItems.map((option, index) => (
                <UserOption
                key={index}
                label={option.label}
                value={option.value}
                isSelected={option.value === selectedValue}
                onClick={(event) => handleOptionClick(event, option.value)}
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