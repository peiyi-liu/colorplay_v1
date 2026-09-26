import { useState } from 'react';

import type { ContentAuthoringRepository } from '../api/content-authoring-repository';
import type { ContentMediaRepository } from '../api/content-media-repository';
import type { ContentPublicationRepository } from '../api/content-publication-repository';
import type { ContentEditorState } from '../api/contracts';
import type { ContentImportRepository } from '../import/content-import-repository';
import type { ContentStudioItem } from '../lib/content-studio-model';
import { ContentImportWorkflow } from './content-import-workflow';
import { ContentMediaWorkflow } from './content-media-workflow';
import { ContentPublicationWorkflow } from './content-publication-workflow';

type Workflow = 'import' | 'media' | 'publication';

export function ContentOperatorWorkflows({
  authoringRepository,
  editorState,
  importRepository,
  mediaRepository,
  onChanged,
  publicationRepository,
  selected,
}: Readonly<{
  authoringRepository: ContentAuthoringRepository;
  editorState: ContentEditorState | null;
  importRepository?: ContentImportRepository | undefined;
  mediaRepository?: ContentMediaRepository | undefined;
  onChanged: () => void;
  publicationRepository?: ContentPublicationRepository | undefined;
  selected: ContentStudioItem | null;
}>) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);

  return (
    <section aria-label="內容操作流程" className="content-operators">
      <div className="content-operators__tabs" role="toolbar">
        <strong>操作流程</strong>
        <button
          aria-pressed={workflow === 'import'}
          onClick={() => {
            setWorkflow((current) => (current === 'import' ? null : 'import'));
          }}
          type="button"
        >
          外部匯入
        </button>
        <button
          aria-pressed={workflow === 'media'}
          onClick={() => {
            setWorkflow((current) => (current === 'media' ? null : 'media'));
          }}
          type="button"
        >
          圖片
        </button>
        <button
          aria-pressed={workflow === 'publication'}
          onClick={() => {
            setWorkflow((current) =>
              current === 'publication' ? null : 'publication',
            );
          }}
          type="button"
        >
          發布／歷史
        </button>
      </div>
      {workflow === 'import' ? (
        <ContentImportWorkflow
          mediaRepository={mediaRepository}
          onCommitted={onChanged}
          repository={importRepository}
        />
      ) : null}
      {workflow === 'media' ? (
        <ContentMediaWorkflow
          authoringRepository={authoringRepository}
          editorState={editorState}
          mediaRepository={mediaRepository}
          onAttached={onChanged}
          selected={selected}
        />
      ) : null}
      {workflow === 'publication' ? (
        <ContentPublicationWorkflow
          editorState={editorState}
          key={`${selected?.entityType ?? 'none'}-${selected?.entityId ?? selected?.draftId ?? 'none'}-${String(editorState?.draft?.revision ?? 0)}-${String(editorState?.current?.version ?? 0)}`}
          onChanged={onChanged}
          repository={publicationRepository}
          selected={selected}
        />
      ) : null}
    </section>
  );
}
