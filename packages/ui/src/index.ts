/**
 * Sistema de diseño.
 *
 * Rebanada 28. Lo que hay aquí es lo que la cáscara y las pantallas de acceso necesitan; los
 * primitivos de colección (28d) y de formulario avanzado (28e) llegan después.
 *
 * Los estilos viven en `./src/styles/tokens.css`, que la aplicación importa una vez.
 */

export {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
} from "./components/button.tsx"
export { Callout, type CalloutProps, type CalloutTone } from "./components/callout.tsx"
export {
  CollectionLayout,
  CollectionSkeleton,
  type CollectionView,
  EmptyState,
  ErrorState,
  FilterChip,
  type FilterChipProps,
  ItemCard,
  Pagination,
  type PaginationProps,
  SearchField,
  type SearchFieldProps,
} from "./components/collection.tsx"
export {
  Checkbox,
  type CheckboxProps,
  Select,
  Switch,
  type SwitchProps,
} from "./components/controls.tsx"
export {
  Dialog,
  DialogClose,
  DialogContent,
  type DialogContentProps,
  type DialogSize,
  DialogTrigger,
} from "./components/dialog.tsx"
export {
  AmountInput,
  type AmountInputProps,
  Field,
  type FieldIds,
  type FieldProps,
  Input,
  type InputProps,
  Textarea,
  type TextareaProps,
} from "./components/field.tsx"
export {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "./components/menu.tsx"
export { PasswordInput, type PasswordInputProps } from "./components/password-input.tsx"
export { Spinner, type SpinnerProps } from "./components/spinner.tsx"
export {
  Avatar,
  Badge,
  type BadgeTone,
  Panel,
  Separator,
  Skeleton,
} from "./components/surfaces.tsx"
export {
  Wizard,
  type WizardLabels,
  type WizardStepView,
} from "./components/wizard.tsx"
/**
 * La máquina del asistente, agrupada.
 *
 * `advance`, `back`, `submit` y `start` sueltos en la raíz del sistema de diseño chocarían con
 * medio vocabulario de cualquier pantalla. Los tipos sí van sueltos: sus nombres ya son suyos.
 */
export { sanitizeAmount, toDecimalString } from "./lib/amount-input.ts"
export { cn } from "./lib/cn.ts"
export type { StepErrors, WizardState, WizardStep } from "./lib/wizard.ts"
export * as wizard from "./lib/wizard.ts"
