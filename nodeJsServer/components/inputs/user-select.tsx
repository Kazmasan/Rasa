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

const UserOption = ({ label, value, onClick, isSelected }: { label: string, value: string, onClick: MouseEventHandler<HTMLDivElement>, isSelected?: boolean }) => {
    const { openConversationIdsList } = useContext(WebSocketContext);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        setIsOpen(openConversationIdsList.includes(value));
    }, [openConversationIdsList]);

    const isActive = isSelected || isOpen; // active if selected by value OR marked open (green dot)

    return (
        <div
            className={cn(
                "w-full cursor-pointer flex items-center gap-3 px-3 py-2 text-black break-all transition",
                // If active (selected or open) keep blue background always, and ensure hover keeps it.
                isActive ? "bg-blue-100 hover:bg-blue-100" : "hover:bg-gray-100"
            )}
            onClick={onClick}>
            <span className="flex items-center justify-start w-6">
                <span className={cn("inline-block h-3 w-3 rounded-full", isOpen ? "bg-green-500" : "bg-red-500")}></span>
            </span>
            <span className="flex-1 text-left text-sm">{label}</span>
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
        setShowOptions(prev => !prev);
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
        <div
        ref={containerRef}
        className={cn(
            "w-full text-sm relative h-[36px]",
            showOptions ? "overflow-visible" : "overflow-hidden",
            // Avoid animating the container to prevent any header layout shift
            "transition-none",
            "z-[60]" // ✅ on force un contexte z-index supérieur pour le header + menu
        )}
        onClick={handleSelectElementClick}
        >
        {/* Header toujours visible — rendu sticky en haut du conteneur/viewport
            Note: sticky fonctionne seulement si un ancêtre scrollable existe (ou le viewport).
        */}
        <div
            className={cn(
            "w-full h-[36px] shrink-0 rounded-[6px] flex items-center justify-between px-[10px] bg-white border border-gray-light hover:border-secondary cursor-pointer",
            "transition-colors duration-200 ease-in-out",
            showOptions && "!border-primary",
            className,
            "z-[9999] sticky top-0" // ✅ quick-fix: header au-dessus du menu (haute priorité)
            )}
        >
            <span className="text-text break-all">Chat History</span>
            <SelectArrowIcon
            width={8}
            height={8}
            className={cn(
                "transition-transform duration-300 ease-in-out rotate-0 fill-gray-dark",
                showOptions && "rotate-180 fill-primary"
            )}
            />
        </div>

        {/* Menu déroulant vers le haut */}
        <div
            ref={optionsRef}
            className={cn(
            "absolute left-0 bottom-full w-full mb-2 z-[65]", // ✅ au-dessus du contenu, mais sous l’en-tête
            "flex flex-col py-2 gap-2 bg-white text-text max-h-[50vh] overflow-y-auto rounded-[6px] shadow-[0px_6px_18px_rgba(0,0,0,0.06)] border border-gray-100",
            "transition-opacity transition-transform duration-200 ease-out",
            showOptions
                ? "opacity-100 translate-y-0 visible"
                : "opacity-0 translate-y-2 invisible pointer-events-none"
            )}
        >
            {options.map((option, index) => (
            <UserOption
                key={index}
                label={option.label}
                value={option.value}
                isSelected={option.value === selectedValue}
                onClick={(event) => handleOptionClick(event, option.value)}
            />
            ))}
        </div>
        </div>

    );
};

export { UserSelect };