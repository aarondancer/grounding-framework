import type { Extension } from "@codemirror/state";
import { basicSetup, EditorView } from "codemirror";
import { useEffect, useRef } from "react";

/**
 * CodeMirror 6 surface (spec/15: code surfaces where an editor materially
 * improves usability). Client-only: CodeMirror owns its DOM, so SSR renders
 * the container div and the editor mounts on hydration. `onChange` streams
 * doc updates back to React state.
 */
export function CodeEditor({
  value,
  onChange,
  language,
  height = 288,
}: {
  value: string;
  onChange: (v: string) => void;
  language?: Extension;
  height?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // Latest onChange without re-creating the editor every render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Mount-only: value changes come back through onChange → parent state, so
  // re-including `value`/`language` here would re-create the editor per
  // keystroke. External doc resets aren't needed by current callers.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate mount-only editor
  useEffect(() => {
    if (!host.current) return;
    const extensions: Extension[] = [
      basicSetup,
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChangeRef.current(u.state.doc.toString());
      }),
      EditorView.theme({}, { dark: false }),
    ];
    if (language) extensions.push(language);
    view.current = new EditorView({
      doc: value,
      extensions,
      parent: host.current,
    });
    return () => {
      view.current?.destroy();
      view.current = null;
    };
    // Mount once; external `value` changes after mount are not written back
    // (the editor is the source of truth while focused).
  }, [language]);

  return (
    <div
      ref={host}
      style={{ height }}
      className="w-full overflow-auto rounded border border-zinc-300 bg-white text-xs [&_.cm-editor]:h-full [&_.cm-editor]:text-xs"
    />
  );
}
