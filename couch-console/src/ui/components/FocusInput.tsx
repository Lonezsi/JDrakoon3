import { useRef, type CSSProperties } from "react";
import { useFocusable } from "../../navigation/FocusContext";

/** A text input that lives in the gamepad focus graph. Selecting it (A / click)
 *  gives the input DOM focus and opens the on-screen keyboard, which then edits
 *  this field — so dashboard text entry works without a physical keyboard. */
export function FocusInput({
  id,
  layer = "root",
  initial = false,
  className = "",
  wrapperClassName = "",
  value,
  onChange,
  placeholder,
  type = "text",
  maxLength,
  onEnter,
  style,
}: {
  id: string;
  layer?: string;
  initial?: boolean;
  className?: string;
  wrapperClassName?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  maxLength?: number;
  onEnter?: () => void;
  style?: CSSProperties;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const focusAndType = () => {
    inputRef.current?.focus();
    window.dispatchEvent(new Event("open-vkb"));
  };
  const { ref, focused } = useFocusable<HTMLDivElement>(id, {
    layer,
    initial,
    onSelect: focusAndType,
  });
  return (
    <div
      ref={ref}
      className={`rounded-xl ${focused ? "ring-2 ring-indigo-400" : ""} ${wrapperClassName}`}
    >
      <input
        ref={inputRef}
        type={type}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter?.();
        }}
        className={className}
        style={style}
      />
    </div>
  );
}
