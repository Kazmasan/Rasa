"use client";

import { MouseEventHandler, useContext, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SelectArrowIcon } from "@/components/icons/select-arrow";
import { WebSocketContext } from "@/components/contexts/WebSocketContext";

interface SelectProps {
    options: SelectInput.Option[];
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    className?: string;
    onChangeHandleValueChange?: boolean;
};

const UserOption = ({ label, value, onClick }: { label: string, value: string, onClick: MouseEventHandler<HTMLDivElement> }) => {
    const { openConversationIdsList } = useContext(WebSocketContext);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        setIsOpen(openConversationIdsList.includes(value))
    }, [openConversationIdsList]);
    return (
        <div
            className="w-full cursor-pointer flex items-center gap-[8px] px-[10px] py-[6px] text-background hover:text-accent hover:bg-background transition break-all"
            onClick={onClick}>
            <span className="flex-grow relative flex h-3 w-3">{
                isOpen ? (<><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span></>) :
                    (<span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>)
            }
            </span>
            <span>{label}</span>
        </div>
    );
};

const UserSelect = ({ options, value, onChange, placeholder = "Select an element", className, onChangeHandleValueChange }: SelectProps) => {
    const [showOptions, setShowOptions] = useState<boolean>(false);
    const [selectedValue, setSelectedValue] = useState<string | undefined>(value);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const optionsRef = useRef<HTMLDivElement | null>(null);

    // Synchronize external value changes
    useEffect(() => {
        setSelectedValue(value);
    }, [value]);

    const toggleDropdown = () => {
        console.log("toggle")
        setShowOptions((prev) => !prev)
    };
    const closeDropdown = () => {
        console.log("close")
        setShowOptions(false)
    };

    const handleSelectElementClick = (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        if (!containerRef.current || !optionsRef.current || !(event.target instanceof Element)) return;
        if (optionsRef.current.contains(event.target) || optionsRef.current.isSameNode(event.target)) return;

        toggleDropdown();
    };

    const handleOptionClick = (event: React.MouseEvent<HTMLDivElement, MouseEvent>, optionValue: string) => {
        closeDropdown();
        if (onChange) {
            onChange(optionValue);
            if (onChangeHandleValueChange) return;
        };
        setSelectedValue(value);
    };

    const handleWindowClick = (event: MouseEvent) => {
        if (!containerRef.current || !(event.target instanceof Element)) return;

        if (containerRef.current.contains(event.target) || !document.contains(event.target)) return;

        closeDropdown();
    };

    // Handle click outside to close dropdown
    useEffect(() => {
        window.addEventListener("click", handleWindowClick);
        return () => {
            window.removeEventListener("click", handleWindowClick);
        };
    }, []);

    return (
        <div ref={containerRef}
            className="w-full h-[36px] text-sm flex flex-col overflow-y-visible relative"
            onClick={handleSelectElementClick}>
            <div className={cn(
                "w-full h-[36px] shrink-0 rounded-[4px] flex items-center justify-between px-[10px] bg-background border border-gray-light hover:border-secondary cursor-pointer transition",
                showOptions && "rounded-b-none !border-primary",
                className
            )}>
                <span className="text-text break-all">{selectedValue ? options.find((o) => o.value === selectedValue)?.label : placeholder}</span>
                <SelectArrowIcon width={8} height={8} className={cn(
                    "transition-transform duration-300 ease-in-out rotate-0 fill-gray-dark",
                    showOptions && "rotate-180 fill-primary")} />
            </div>
            <div ref={optionsRef}
                className={cn(
                    "hidden cursor-auto w-full rounded-b-[4px] flex-col py-[6px] gap-[6px] bg-accent max-h-[50vh] overflow-y-auto z-50 shadow-lg absolute left-0 mt-1",
                    showOptions && "flex"
                )}>

                {options.map((option, index) => (
                    <UserOption key={index} label={option.label} value={option.value} onClick={(event) => handleOptionClick(event, option.value)} />
                ))}
            </div>
        </div>
    );
};

export { UserSelect };