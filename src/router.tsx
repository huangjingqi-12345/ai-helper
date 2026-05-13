import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Overview } from '@/pages/Overview/Overview';
import { ContentWorkshop } from '@/pages/ContentWorkshop/ContentWorkshop';
import { ContentDetail } from '@/pages/ContentDetail/ContentDetail';
import { BehaviorInsights } from '@/pages/BehaviorInsights/BehaviorInsights';
import { DistributionStrategy } from '@/pages/DistributionStrategy/DistributionStrategy';
import { DistributionProjectDetail } from '@/pages/DistributionProject/DistributionProjectDetail';
import { ApprovalCenter } from '@/pages/ApprovalCenter/ApprovalCenter';
import { PlatformManagement } from '@/pages/PlatformManagement/PlatformManagement';
import { TenantManagement } from '@/pages/Admin/TenantManagement';
import { AccountManagement } from '@/pages/Admin/AccountManagement';
import { ApprovalFlowConfig } from '@/pages/Admin/ApprovalFlowConfig';
import { Settings } from '@/pages/Settings/Settings';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Overview /> },
      { path: 'content', element: <ContentWorkshop /> },
      { path: 'content/:id', element: <ContentDetail /> },
      { path: 'audience', element: <BehaviorInsights /> },
      { path: 'distribute', element: <DistributionStrategy /> },
      { path: 'distribute/:id', element: <DistributionProjectDetail /> },
      { path: 'approvals', element: <ApprovalCenter /> },
      { path: 'content-workshop', element: <ContentWorkshop /> },
      { path: 'content-workshop/:id', element: <ContentDetail /> },
      { path: 'behavior-insights', element: <BehaviorInsights /> },
      { path: 'distribution-strategy', element: <DistributionStrategy /> },
      { path: 'distribution-strategy/:id', element: <DistributionProjectDetail /> },
      { path: 'approval-center', element: <ApprovalCenter /> },
      { path: 'platform-management', element: <PlatformManagement /> },
      { path: 'settings', element: <Settings /> },
      // Admin sub-pages
      { path: 'admin', element: <Navigate to="/admin/tenants" replace /> },
      { path: 'admin/tenants', element: <TenantManagement /> },
      { path: 'admin/accounts', element: <AccountManagement /> },
      { path: 'admin/approval-flows', element: <ApprovalFlowConfig /> },
    ],
  },
]);
