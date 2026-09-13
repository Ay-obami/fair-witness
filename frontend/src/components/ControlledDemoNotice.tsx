import { CONTROLLED_DEMO_LABEL } from "../lib/controlledDemo"

export function ControlledDemoNotice() {
  return <aside className="relative overflow-hidden rounded-2xl border border-alert-500/25 bg-alert-500/5 p-4 text-xs leading-relaxed text-ledger-400" role="note">
    <div className="absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-alert-400 to-transparent" />
    <div className="flex items-start gap-3"><span className="mt-0.5 inline-flex shrink-0 items-center gap-2 rounded-full border border-alert-500/25 bg-alert-500/5 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-widest text-alert-400"><span className="h-1.5 w-1.5 rounded-full bg-alert-400" /> Controlled test market</span><p><strong className="font-medium text-ledger-200">Verification and execution are real.</strong> {CONTROLLED_DEMO_LABEL}</p></div>
  </aside>
}
