export type ApprovalRole = 'Rep' | 'Sales Head' | 'Founder';
export type DecisionAction = 'Approved' | 'Rejected' | 'Changes requested';
export type ApprovalStepState = 'done' | 'current' | 'skipped' | 'todo' | 'stopped';

export interface ApprovalHistoryEvent {
  at: string;
  actor: string;
  message: string;
}

export interface ApprovalHistoryQuote {
  status: string;
  requiredApprover: ApprovalRole;
  discountPercent: number;
  effectiveDiscountPercent: number;
  originalDiscountPercent: number;
  approvedAt?: string | null;
  history: ApprovalHistoryEvent[];
}

export interface ApprovalDecision {
  action: DecisionAction;
  name: string;
  role: ApprovalRole;
  at: string;
}

export interface ApprovalStep {
  state: ApprovalStepState;
  note: string;
}

const seniority: Record<ApprovalRole, number> = { Rep: 0, 'Sales Head': 1, Founder: 2 };
const roleByName: Record<string, ApprovalRole> = {
  'Aarav Mehta': 'Rep',
  'Meera Iyer': 'Sales Head',
  'Rohan Kapoor': 'Founder',
};
const roles = '(Rep|Sales Head|Founder)';
const decisionMessage = new RegExp(`^(Approved|Rejected|Changes requested) by (.+?) \\(${roles}\\)(?: — ${roles} band)?\\.`);

function parseDecision(event: ApprovalHistoryEvent): ApprovalDecision | null {
  const match = event.message.match(decisionMessage);
  if (match) {
    return { action: match[1] as DecisionAction, name: match[2]!, role: match[3] as ApprovalRole, at: event.at };
  }

  // Seeded examples predate role-specific decision messages; their actor still identifies the simulator role.
  const role = roleByName[event.actor];
  if (!role) return null;
  if (event.message.startsWith('Quote approved (Simulated demo).')) {
    return { action: 'Approved', name: event.actor, role, at: event.at };
  }
  if (event.message.startsWith('Rejected:')) {
    return { action: 'Rejected', name: event.actor, role, at: event.at };
  }
  if (event.message.startsWith('Changes requested:')) {
    return { action: 'Changes requested', name: event.actor, role, at: event.at };
  }
  return null;
}

export function getCurrentDecision(q: ApprovalHistoryQuote): ApprovalDecision | null {
  const expectedAction: DecisionAction | undefined =
    q.status === 'approved' || q.status === 'sent' || q.status === 'accepted' ? 'Approved' :
    q.status === 'rejected' ? 'Rejected' :
    q.status === 'changes_requested' ? 'Changes requested' : undefined;
  if (!expectedAction) return null;

  for (let index = q.history.length - 1; index >= 0; index--) {
    const decision = parseDecision(q.history[index]!);
    if (decision?.action === expectedAction) return decision;
  }
  return null;
}

function discountText(value: number) {
  return `${Number(value.toFixed(2))}%`;
}

function originalRouteNote(q: ApprovalHistoryQuote) {
  const routeIndex = q.history.findIndex((event) => /^Routed to (Sales Head|Founder|Rep)\./.test(event.message));
  if (routeIndex < 0) return null;

  const routeMessage = q.history[routeIndex]!.message;
  const routeMatch = routeMessage.match(/^Routed to (Sales Head|Founder|Rep)\.\s*(?:(\d+(?:\.\d+)?)% effective discount requires)/);
  if (!routeMatch) return null;

  const originalRole = routeMatch[1] as ApprovalRole;
  if (seniority[originalRole] <= seniority[q.requiredApprover]) return null;

  let loweredDiscount: { from: number; to: number } | null = null;
  for (const event of q.history.slice(routeIndex + 1)) {
    const match = event.message.match(/^Discount percent changed (\d+(?:\.\d+)?)% → (\d+(?:\.\d+)?)%/);
    if (!match) continue;
    const from = Number(match[1]);
    const to = Number(match[2]);
    if (from > to && Math.abs(to - q.discountPercent) < 0.01) loweredDiscount = { from, to };
  }
  if (!loweredDiscount) return null;

  const originalDiscount = Number(routeMatch[2] ?? loweredDiscount.from);
  return `Originally routed to ${originalRole} at ${discountText(originalDiscount)}; edited to ${discountText(loweredDiscount.to)}`;
}

function skippedForCurrentRoute(role: 'Sales Head' | 'Founder', requiredApprover: ApprovalRole): ApprovalStep {
  if (requiredApprover === 'Rep') return { state: 'skipped', note: 'Skipped — within rep band' };
  return {
    state: 'skipped',
    note: role === 'Sales Head' ? 'Skipped — routed straight to Founder' : 'Skipped — Sales Head band covers it',
  };
}

export function getApprovalPath(
  q: ApprovalHistoryQuote,
  formatDate: (date: string) => string,
) {
  const decision = getCurrentDecision(q);
  const approved = decision?.action === 'Approved' ? decision : null;

  const stepFor = (role: 'Sales Head' | 'Founder'): ApprovalStep => {
    if (decision) {
      if (decision.role === role) {
        return {
          state: decision.action === 'Approved' ? 'done' : 'stopped',
          note: `${decision.action} by ${decision.name} (${decision.role}) ${formatDate(decision.at)}`,
        };
      }
      if (seniority[decision.role] > seniority[role]) {
        return {
          state: 'skipped',
          note: decision.action === 'Approved' ? `Covered by ${decision.role} approval` : `Decision handled by ${decision.role}`,
        };
      }
    }

    if (q.requiredApprover === 'Rep') return skippedForCurrentRoute(role, q.requiredApprover);
    if (q.requiredApprover !== role) return skippedForCurrentRoute(role, q.requiredApprover);
    if (approved) return { state: 'done', note: q.approvedAt ? `Approved ${formatDate(q.approvedAt)}` : 'Approved' };
    if (q.status === 'pending_approval') return { state: 'current', note: 'Awaiting decision' };
    if (q.status === 'rejected') return { state: 'stopped', note: 'Rejected' };
    if (q.status === 'changes_requested') return { state: 'stopped', note: 'Changes requested' };
    return { state: 'todo', note: 'Needed once submitted' };
  };

  let approverLabel = q.requiredApprover;
  if (decision) approverLabel = `${decision.name} (${decision.role})`;

  return {
    salesHead: stepFor('Sales Head'),
    founder: stepFor('Founder'),
    originalRouteNote: originalRouteNote(q),
    approverLabel,
  };
}
