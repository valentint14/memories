import { ui } from "@/lib/ui";

/** Pașii numerotați dintr-o foaie (01, 02, 03), ca pe pagina principală. */
export function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="flex flex-col">
      {steps.map((text, i) => (
        <li key={text} className="flex gap-5 border-b border-rule py-4 first:pt-0 last:border-b-0 last:pb-0">
          <span className={`${ui.data} pt-0.5 text-sm text-accent`}>{String(i + 1).padStart(2, "0")}</span>
          <span className="leading-relaxed">{text}</span>
        </li>
      ))}
    </ol>
  );
}
