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
export { Counter, type CounterProps } from "./components/counter.tsx"
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
  FilePicker,
  type FilePickerLabels,
  type FilePickerProps,
  type PickedFile,
} from "./components/file-picker.tsx"
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
export {
  type ChatEntry,
  type ChatEntrySide,
  OrderChat,
  type OrderChatLabels,
  type OrderChatProps,
} from "./components/order-chat.tsx"
export { PasswordInput, type PasswordInputProps } from "./components/password-input.tsx"
export { ReorderList, type ReorderListProps } from "./components/reorder-list.tsx"
export { SearchSelect, type SearchSelectProps } from "./components/search-select.tsx"
export { Spinner, type SpinnerProps } from "./components/spinner.tsx"
export {
  Avatar,
  Badge,
  type BadgeTone,
  Fact,
  Panel,
  type PanelProps,
  Separator,
  Skeleton,
  StatCard,
  type StatCardProps,
  type Tint,
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
export {
  type DecimalSeparator,
  sanitizeAmount,
  toDecimalString,
} from "./lib/amount-input.ts"
/**
 * Lo de archivos, agrupado por lo mismo que el asistente.
 *
 * `classify`, `review`, `fitWithin`, `pending` o `reduce` sueltos en la raíz del sistema de diseño
 * chocarían con medio vocabulario de cualquier pantalla. Los tipos sí van sueltos, y los dos
 * ayudantes del navegador también: sus nombres ya son suyos.
 */
export * as browserMedia from "./lib/browser-media.ts"
export { cn } from "./lib/cn.ts"
export type {
  Derivative,
  DerivativeContentType,
  UploadVariant,
} from "./lib/file-derivatives.ts"
export * as fileDerivatives from "./lib/file-derivatives.ts"
export type {
  AcceptedFile,
  FileKind,
  Previewability,
  Rejection,
  RejectionReason,
  SelectionPolicy,
} from "./lib/file-kinds.ts"
export * as fileKinds from "./lib/file-kinds.ts"
export type {
  FileUpload,
  UploadAuthorization,
  UploadPhase,
  UploadPorts,
  UploadRequest,
  UploadResult,
  UploadStage,
  UploadState,
  UploadSummary,
  UploadTarget,
} from "./lib/file-upload.ts"
export * as fileUpload from "./lib/file-upload.ts"
export type { DragState, Reorder } from "./lib/reorder.ts"
/**
 * La máquina del arrastre, agrupada por lo mismo que la del asistente: `move`, `drop` y `cancel`
 * sueltos en la raíz del sistema de diseño chocarían con medio vocabulario de cualquier pantalla.
 */
export * as reorder from "./lib/reorder.ts"
export { filterOptions, type SelectOption } from "./lib/search-select.ts"
export type { StepErrors, WizardState, WizardStep } from "./lib/wizard.ts"
export * as wizard from "./lib/wizard.ts"
