/**
 * The reason a custom formula point cannot be saved from the Extended settings drawer (#824). Kept apart from the
 * drawer so the panel formats the message and the chart-side check (`ChartView`) decides what is wrong.
 */
/**
 * @module ui/custom-point-problem
 * @purpose Types the two reasons a drawer formula is refused: the formula is unreadable, or it duplicates a built-in point.
 * @conventions A discriminated union the drawer turns into copy; carries no text itself so both locales stay in the messages catalogue.
 * @exports FormulaProblem
 */
export type FormulaProblem =
  { readonly kind: 'invalid'; readonly message: string } | { readonly kind: 'redundant'; readonly name: string };
