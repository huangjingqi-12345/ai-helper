import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Overview } from '@/pages/Overview/Overview';
import { ContentWorkshop } from '@/pages/ContentWorkshop/ContentWorkshop';
import { BehaviorInsights } from '@/pages/BehaviorInsights/BehaviorInsights';
import { DistributionStrategy } from '@/pages/DistributionStrategy/DistributionStrategy';
import { ApprovalCenter } from '@/pages/ApprovalCenter/ApprovalCenter';
import { PlatformManagement } from '@/pages/PlatformManagement/PlatformManagement';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Overview /> },
      { path: 'content-workshop', element: <ContentWorkshop /> },
      { path: 'behavior-insights', element: <BehaviorInsights /> },
      { path: 'distribution-strategy', element: <DistributionStrategy /> },
      { path: 'approval-center', element: <ApprovalCenter /> },
      { path: 'platform-management', element: <PlatformManagement /> },
    ],
  },
]);
