import type { FC } from "react";

// Horários de meia em meia hora, no formato 24 h, mais 23:59 para "até o fim
// do dia". O <input type="time"> segue o idioma do navegador (AM/PM em
// inglês) e é ruim de editar — por isso uma lista.
const TIMES = [
  ...Array.from(
    { length: 48 },
    (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`,
  ),
  "23:59",
];

interface TimeSelectProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

const TimeSelect: FC<TimeSelectProps> = ({ value, onChange, className, disabled, ...rest }) => {
  // Horário já salvo fora da grade (ex.: 08:10) continua aparecendo.
  const options = !value || TIMES.includes(value) ? TIMES : [...TIMES, value].sort();
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      aria-label={rest["aria-label"]}
    >
      {options.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
};

export default TimeSelect;
