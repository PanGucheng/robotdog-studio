import { useEffect, useId, useRef, useState } from 'react'
import { BookOpen, Pencil, X } from 'lucide-react'
import { toStudentErrorMessage } from '../lib/student-errors'

interface StudioDialogProps {
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  input?: { label: string; initialValue: string; maxLength?: number }
  onConfirm(value: string): void | Promise<void>
  onCancel(): void
}

export function StudioDialog({ title, description, confirmLabel, cancelLabel = '取消', input, onConfirm, onCancel }: StudioDialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const submittingRef = useRef(false)
  const id = useId()
  const [value, setValue] = useState(input?.initialValue ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    const dialog = dialogRef.current!
    dialog.showModal()
    if (inputRef.current) { inputRef.current.focus(); inputRef.current.select() }
    else cancelRef.current?.focus()
    return () => {
      dialog.close()
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])

  const cancel = (): void => { if (!submittingRef.current) onCancel() }
  return <dialog ref={dialogRef} className="studio-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    onCancel={(event) => { event.preventDefault(); cancel() }}>
    <form onSubmit={async (event) => {
      event.preventDefault()
      if (submittingRef.current || (input && !value.trim())) return
      submittingRef.current = true
      setPending(true)
      setError(undefined)
      try { await onConfirm(value.trim()) }
      catch (caught) { setError(toStudentErrorMessage(caught)) }
      finally { submittingRef.current = false; setPending(false) }
    }}>
      <header className="studio-dialog-heading">
        <span className="studio-dialog-symbol" aria-hidden="true">{input ? <Pencil size={22} /> : <BookOpen size={24} />}</span>
        <div><small>{input ? '项目名称' : '课程学习'}</small><h2 id={`${id}-title`}>{title}</h2></div>
        <button type="button" className="studio-dialog-close" aria-label="关闭提示" disabled={pending} onClick={cancel}><X size={18} /></button>
      </header>
      <div className="studio-dialog-body">
        <p id={`${id}-description`}>{description}</p>
        {input && <label htmlFor={`${id}-input`}>{input.label}<input ref={inputRef} id={`${id}-input`} value={value} maxLength={input.maxLength ?? 80} disabled={pending}
          onChange={(event) => { setValue(event.target.value); setError(undefined) }} autoComplete="off" /></label>}
        {error && <p className="studio-dialog-error" role="alert">{error}</p>}
      </div>
      <footer className="studio-dialog-actions">
        <button ref={cancelRef} type="button" disabled={pending} onClick={cancel}>{cancelLabel}</button>
        <button type="submit" className="is-primary" disabled={pending || Boolean(input && !value.trim())}>{pending ? '正在保存…' : confirmLabel}</button>
      </footer>
    </form>
  </dialog>
}
