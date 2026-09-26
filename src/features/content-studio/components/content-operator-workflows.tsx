import type { ContentMediaRepository } from '../api/content-media-repository';
import type { ContentPublicationRepository } from '../api/content-publication-repository';
import type { ContentEditorState } from '../api/contracts';
import type { ContentImportRepository } from '../import/content-import-repository';
import type { ContentStudioItem } from '../lib/content-studio-model';
import { ContentImportWorkflow } from './content-import-workflow';
import { ContentPublicationWorkflow } from './content-publication-workflow';

export type ContentOperatorWorkflow = 'import' | 'publication';

export function ContentOperatorWorkflows({
  editorState,
  importRepository,
  mediaRepository,
  onChanged,
  publicationRepository,
  selected,
  workflow,
}: Readonly<{
  editorState: ContentEditorState | null;
  importRepository?: ContentImportRepository | undefined;
  mediaRepository?: ContentMediaRepository | undefined;
  onChanged: () => void;
  publicationRepository?: ContentPublicationRepository | undefined;
  selected: ContentStudioItem | null;
  workflow: ContentOperatorWorkflow;
}>) {
  return (
    <section aria-label="內容操作流程" className="content-operators">
      {workflow === 'import' ? (
        <ContentImportWorkflow
          mediaRepository={mediaRepository}
          onCommitted={onChanged}
          repository={importRepository}
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
