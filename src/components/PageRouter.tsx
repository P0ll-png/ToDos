/**
 * PageRouter — switches on the current nav page (design OD-1): `board` renders
 * the existing Layout board (always available, anon-readable), `absences` and
 * `reviewers` render their (gated) pages. State-based switching, no router.
 */
import { useNav } from '../context/NavProvider';
import { Layout } from './Layout';
import { AbsencesPage } from './AbsencesPage';
import { ReviewersPage } from './ReviewersPage';

export function PageRouter() {
  const { page } = useNav();

  switch (page) {
    case 'absences':
      return <AbsencesPage />;
    case 'reviewers':
      return <ReviewersPage />;
    case 'board':
    default:
      return <Layout />;
  }
}
