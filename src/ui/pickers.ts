import { addFiles, requestOpenProject } from '../state/actions';

// Safari などで change 発火前に GC されないよう参照を保持する
const keep = new Set<HTMLInputElement>();

function pick(opts: { accept?: string; multiple?: boolean }, onFiles: (f: File[]) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  if (opts.accept) input.accept = opts.accept;
  input.multiple = !!opts.multiple;
  input.style.display = 'none';
  input.dataset.testid = 'file-input';
  keep.add(input);
  document.body.appendChild(input);
  const done = () => {
    keep.delete(input);
    input.remove();
  };
  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []);
    done();
    if (files.length) onFiles(files);
  });
  input.addEventListener('cancel', done);
  input.click();
}

export const pickImages = () =>
  pick({ accept: 'image/jpeg,image/png,image/webp', multiple: true }, (f) => void addFiles(f));

/** 拡張子の絞り込みはスマホで効かないことがあるため、先頭バイトで検証する */
export const pickProject = () => pick({}, (f) => requestOpenProject(f[0]));
