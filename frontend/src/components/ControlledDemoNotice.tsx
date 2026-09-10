import { CONTROLLED_DEMO_LABEL } from "../lib/controlledDemo"

export function ControlledDemoNotice() {
  return <aside className="rounded-lg border border-alert-500/40 bg-alert-500/5 p-4 text-xs leading-relaxed text-alert-300" role="note"><strong>Controlled testnet demo.</strong> {CONTROLLED_DEMO_LABEL}</aside>
}
