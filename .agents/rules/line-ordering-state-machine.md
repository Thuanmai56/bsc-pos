# LINE Bot Ordering & State Machine Best Practices

When developing or debugging order flows, webhook handlers, and employee POS dashboards:

## 1. LINE Message UI Design
- **Action Confirmations**: For high-stakes decisions (order cancellations, item swaps, pickup time adjustments), use **Flex Message Cards** with explicit action buttons instead of transient Quick Replies.
  - Buttons embedded in Flex Message cards remain permanently visible in the chat log and are never dismissed when the user opens the on-screen keyboard.
  - Header & button color coding: Use distinct styling (e.g., `#DC2626` Red for cancellations/rejections, `#06C755` Green for approvals/actions).

## 2. Intent Recognition & Customer Reply Logic
- **Cancellation Consent Invariant**:
  - When the bot asks the customer to confirm a cancellation / order rejection:
    - **Consent to cancel**: `同意`, `好`, `好的`, `ok`, `可以`, `取消`, `不要了`, `不用了`, `沒關係`, `收到`, `了解`, `謝謝` -> Transition `order.status = "REJECTED"`.
    - **Explicit disagreement**: `不同意`, `不要取消`, `不想取消`, `請勿取消`, `請不要取消` -> Transition `order.status = "NEW"`.
  - *Never* treat `取消` or `不要` as disagreement when the proposed action itself is a cancellation.
- **Safety Net**: Always support natural language replies through robust keyword normalization and AI fallback analysis (`callAI`).

## 3. State Synchronization & Cleanup
- **Pending Actions**: Whenever an order transitions out of `WAITING_CUSTOMER_*` state, immediately remove the corresponding entry in `pending_actions` (D1).
- **Polling ETag Invalidation**: Ensure all order status updates refresh `updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now')` so frontend dashboards (`orders.html`) receive cache busts and update within the next polling cycle.
- **Frontend Dashboard Filtering**: Orders with status `REJECTED` or `PICKED_UP` must automatically be excluded from the live queue (`leftOrders`) and moved to `historyOrders`.
