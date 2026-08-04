import { useEffect, useRef } from 'react';
import { Bold, Italic, Link as LinkIcon } from 'lucide-react';

// Minimal WYSIWYG editor (bold / italic / link) built on contentEditable. Produces
// HTML that is sent straight through into the email body. Uncontrolled: the initial
// HTML is set once, and edits are pushed up via onChange (so the cursor never jumps).
export const RichEditor = ({
  initialHtml,
  onChange,
}: {
  initialHtml: string;
  onChange: (html: string) => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = initialHtml;
      onChange(initialHtml);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = () => onChange(ref.current?.innerHTML || '');
  const exec = (cmd: string, val?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, val);
    emit();
  };
  const addLink = () => {
    const url = window.prompt('Link URL (include https://)');
    if (url) exec('createLink', url.trim());
  };

  const btn = 'inline-flex h-8 w-8 items-center justify-center rounded border border-outline-variant text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary';

  return (
    <div className="rounded-lg border border-outline-variant bg-surface">
      <div className="flex items-center gap-1.5 border-b border-outline-variant px-2 py-1.5">
        {/* preventDefault keeps the text selection while clicking the toolbar */}
        <button type="button" title="Bold (select text first)" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')} className={btn}><Bold className="h-4 w-4" /></button>
        <button type="button" title="Italic (select text first)" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')} className={btn}><Italic className="h-4 w-4" /></button>
        <button type="button" title="Add link (select text first)" onMouseDown={(e) => e.preventDefault()} onClick={addLink} className={btn}><LinkIcon className="h-4 w-4" /></button>
      </div>
      <div
        ref={ref}
        contentEditable
        onInput={emit}
        role="textbox"
        aria-multiline="true"
        className="min-h-[240px] w-full px-3 py-2.5 text-sm leading-relaxed text-on-surface outline-none [&_a]:text-primary [&_a]:underline"
      />
    </div>
  );
};
