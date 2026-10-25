import * as React from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { RequireSignedIn, RequireState, StartRedirect } from './guards';
import { InShell, RouteError, Suspended } from './RouteFallbacks';
import { LoginPage } from '@/pages/auth/LoginPage';
import { PublicLayout } from '@/pages/public/PublicLayout';
import { LandingPage } from '@/pages/public/LandingPage';
import { PricingPage } from '@/pages/public/PricingPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

// Code-split everything behind sign-in and the long-form public pages.
const lazyPage = <K extends string>(
  load: () => Promise<{ [P in K]: React.ComponentType }>,
  name: K,
) =>
  React.lazy(async () => {
    const mod = await load();
    return { default: mod[name] };
  });

// The app and owner shells (sidebar, command palette, live events) stay out of the public pages' bundle.
const CustomerShell = lazyPage(() => import('./shells'), 'CustomerShell');
const OwnerShell = lazyPage(() => import('./shells'), 'OwnerShell');
const SecurityPage = lazyPage(() => import('@/pages/public/SecurityPage'), 'SecurityPage');
const TermsPage = lazyPage(() => import('@/pages/public/LegalPages'), 'TermsPage');
const PrivacyPage = lazyPage(() => import('@/pages/public/LegalPages'), 'PrivacyPage');
const OnboardingPage = lazyPage(
  () => import('@/features/account/OnboardingPage'),
  'OnboardingPage',
);
const UnderReviewPage = lazyPage(() => import('@/features/account/StatusPages'), 'UnderReviewPage');
const RejectedPage = lazyPage(() => import('@/features/account/StatusPages'), 'RejectedPage');
const InvitePage = lazyPage(() => import('@/features/account/InvitePage'), 'InvitePage');
const ProfilePage = lazyPage(() => import('@/features/account/ProfilePage'), 'ProfilePage');
const OverviewPage = lazyPage(() => import('@/pages/app/OverviewPage'), 'OverviewPage');
const ConnectionsPage = lazyPage(
  () => import('@/features/connections/ConnectionsPage'),
  'ConnectionsPage',
);
const ConnectionWizard = lazyPage(
  () => import('@/features/connections/ConnectionWizard'),
  'ConnectionWizard',
);
const ConnectionDetailPage = lazyPage(
  () => import('@/features/connections/ConnectionDetailPage'),
  'ConnectionDetailPage',
);
const InventoryPage = lazyPage(() => import('@/features/inventory/InventoryPage'), 'InventoryPage');
const ChangesPage = lazyPage(() => import('@/features/changes/ChangesPage'), 'ChangesPage');
const ComparePage = lazyPage(() => import('@/features/changes/ComparePage'), 'ComparePage');
const FindingsPage = lazyPage(() => import('@/features/security/FindingsPage'), 'FindingsPage');
const FindingDetailPage = lazyPage(
  () => import('@/features/security/FindingDetailPage'),
  'FindingDetailPage',
);
const ExceptionsPage = lazyPage(() => import('@/features/security/ExceptionsPage'), 'ExceptionsPage');
const AttackPathsPage = lazyPage(
  () => import('@/features/security/AttackPathsPage'),
  'AttackPathsPage',
);
const ExposurePage = lazyPage(() => import('@/features/security/ExposurePage'), 'ExposurePage');
const IdentityPage = lazyPage(() => import('@/features/security/IdentityPage'), 'IdentityPage');
const VulnerabilitiesPage = lazyPage(
  () => import('@/features/security/VulnerabilitiesPage'),
  'VulnerabilitiesPage',
);
const ThreatsPage = lazyPage(() => import('@/features/security/ThreatsPage'), 'ThreatsPage');
const CoveragePage = lazyPage(() => import('@/features/security/CoveragePage'), 'CoveragePage');
const CompliancePage = lazyPage(
  () => import('@/features/compliance/CompliancePage'),
  'CompliancePage',
);
const FrameworkPage = lazyPage(() => import('@/features/compliance/CompliancePage'), 'FrameworkPage');
const ReliabilityPage = lazyPage(
  () => import('@/features/operate/ReliabilityPage'),
  'ReliabilityPage',
);
const GovernancePage = lazyPage(() => import('@/features/operate/GovernancePage'), 'GovernancePage');
const GovernanceSettingsPage = lazyPage(
  () => import('@/features/operate/GovernanceSettingsPage'),
  'GovernanceSettingsPage',
);
const CustomRulesPage = lazyPage(
  () => import('@/features/operate/CustomRulesPage'),
  'CustomRulesPage',
);
const DiagramPage = lazyPage(() => import('@/features/diagrams/DiagramPage'), 'DiagramPage');
const DocumentPage = lazyPage(() => import('@/features/diagrams/DocumentPage'), 'DocumentPage');
const CostLayout = lazyPage(() => import('@/features/cost/components'), 'CostLayout');
const ExplorerPage = lazyPage(() => import('@/features/cost/ExplorerPage'), 'ExplorerPage');
const ForecastPage = lazyPage(() => import('@/features/cost/ForecastPage'), 'ForecastPage');
const AnomaliesPage = lazyPage(() => import('@/features/cost/AnomaliesPage'), 'AnomaliesPage');
const RightsizingPage = lazyPage(() => import('@/features/cost/OptimizePages'), 'RightsizingPage');
const WastePage = lazyPage(() => import('@/features/cost/OptimizePages'), 'WastePage');
const CommitmentsPage = lazyPage(() => import('@/features/cost/OptimizePages'), 'CommitmentsPage');
const WhatIfPage = lazyPage(() => import('@/features/cost/PlanningPages'), 'WhatIfPage');
const ShowbackPage = lazyPage(() => import('@/features/cost/PlanningPages'), 'ShowbackPage');
const SavingsPage = lazyPage(() => import('@/features/cost/PlanningPages'), 'SavingsPage');
const RecommendationsPage = lazyPage(
  () => import('@/features/recommendations/RecommendationsPage'),
  'RecommendationsPage',
);
const ReportsPage = lazyPage(() => import('@/features/reports/ReportsPage'), 'ReportsPage');
const ServerHealthPage = lazyPage(() => import('@/features/servers/ServerHealthPage'), 'ServerHealthPage');
const ServerDetailPage = lazyPage(() => import('@/features/servers/ServerDetailPage'), 'ServerDetailPage');
const BrandingPage = lazyPage(() => import('@/features/reports/BrandingPage'), 'BrandingPage');
const AlertsPage = lazyPage(() => import('@/features/alerts/AlertsPage'), 'AlertsPage');
const BillingPage = lazyPage(() => import('@/features/billing/BillingPage'), 'BillingPage');
const AiSettingsPage = lazyPage(() => import('@/features/ai/AiSettingsPage'), 'AiSettingsPage');
const OrgAuditPage = lazyPage(() => import('@/pages/app/OrgAuditPage'), 'OrgAuditPage');
const TeamPage = lazyPage(() => import('@/features/team/TeamPage'), 'TeamPage');
const NotificationsPage = lazyPage(
  () => import('@/features/notifications/NotificationsPage'),
  'NotificationsPage',
);
const OwnerOverviewPage = lazyPage(
  () => import('@/features/owner/OwnerOverviewPage'),
  'OwnerOverviewPage',
);
const ApprovalsPage = lazyPage(() => import('@/features/owner/ApprovalsPage'), 'ApprovalsPage');
const OrgsPage = lazyPage(() => import('@/features/owner/OrgsPage'), 'OrgsPage');
const OrgDetailPage = lazyPage(() => import('@/features/owner/OrgDetailPage'), 'OrgDetailPage');
const UsersPage = lazyPage(() => import('@/features/owner/UsersPage'), 'UsersPage');
const PlansPage = lazyPage(() => import('@/features/owner/PlansPage'), 'PlansPage');
const BusinessPage = lazyPage(() => import('@/features/owner/BusinessPage'), 'BusinessPage');
const HealthPage = lazyPage(() => import('@/features/owner/HealthPage'), 'HealthPage');
const AnnouncementsPage = lazyPage(() => import('@/features/owner/PlatformPages'), 'AnnouncementsPage');
const FeatureFlagsPage = lazyPage(() => import('@/features/owner/PlatformPages'), 'FeatureFlagsPage');
const EmailTemplatesPage = lazyPage(() => import('@/features/owner/PlatformPages'), 'EmailTemplatesPage');
const RetirementsPage = lazyPage(() => import('@/features/owner/PlatformPages'), 'RetirementsPage');
const OwnerAuditPage = lazyPage(() => import('@/features/owner/AuditPage'), 'OwnerAuditPage');

export const routes: RouteObject[] = [
  // Public marketing pages: outside the root Suspense boundary, because they are prerendered and
  // hydrated (decision 0043). PublicLayout has its own boundary around the page, which the
  // prerender marks the way React's server renderer would.
  {
    element: <PublicLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'pricing', element: <PricingPage /> },
      { path: 'security', element: <SecurityPage /> },
      { path: 'terms', element: <TermsPage /> },
      { path: 'privacy', element: <PrivacyPage /> },
    ],
  },
  {
    element: <Suspended />,
    errorElement: <RouteError />,
    children: [
      { path: 'login', element: <LoginPage /> },
      { path: 'signup', element: <LoginPage signUp /> },
      {
        element: <RequireSignedIn />,
        children: [
          { path: 'start', element: <StartRedirect /> },
          { path: 'invite/:token', element: <InvitePage /> },
          {
            element: <RequireState states={['profile_incomplete']} />,
            children: [{ path: 'onboarding', element: <OnboardingPage /> }],
          },
          {
            element: <RequireState states={['pending_approval']} />,
            children: [{ path: 'under-review', element: <UnderReviewPage /> }],
          },
          {
            element: <RequireState states={['rejected', 'suspended']} />,
            children: [{ path: 'rejected', element: <RejectedPage /> }],
          },
          {
            path: 'app',
            element: <RequireState states={['active']} customerOnly />,
            children: [
              {
                element: <CustomerShell />,
                children: [
                  {
                    element: <InShell />,
                    errorElement: <RouteError inShell />,
                    children: [
                      { index: true, element: <OverviewPage /> },
                      { path: 'inventory', element: <InventoryPage /> },
                      { path: 'changes', element: <ChangesPage /> },
                      { path: 'changes/compare', element: <ComparePage /> },
                      { path: 'diagrams', element: <DiagramPage /> },
                      { path: 'diagrams/document', element: <DocumentPage /> },
                      { path: 'security/findings', element: <FindingsPage /> },
                      { path: 'security/findings/:findingId', element: <FindingDetailPage /> },
                      { path: 'security/exceptions', element: <ExceptionsPage /> },
                      { path: 'security/attack-paths', element: <AttackPathsPage /> },
                      { path: 'security/exposure', element: <ExposurePage /> },
                      { path: 'security/identity', element: <IdentityPage /> },
                      { path: 'security/vulnerabilities', element: <VulnerabilitiesPage /> },
                      { path: 'security/threats', element: <ThreatsPage /> },
                      { path: 'security/coverage', element: <CoveragePage /> },
                      { path: 'security/compliance', element: <CompliancePage /> },
                      { path: 'security/compliance/:framework', element: <FrameworkPage /> },
                      { path: 'reliability', element: <ReliabilityPage /> },
                      { path: 'governance', element: <GovernancePage /> },
                      { path: 'server-health', element: <ServerHealthPage /> },
                      { path: 'server-health/:serverId', element: <ServerDetailPage /> },
                      {
                        path: 'cost',
                        element: <CostLayout />,
                        children: [
                          { index: true, element: <ExplorerPage /> },
                          { path: 'forecast', element: <ForecastPage /> },
                          { path: 'anomalies', element: <AnomaliesPage /> },
                          { path: 'rightsizing', element: <RightsizingPage /> },
                          { path: 'waste', element: <WastePage /> },
                          { path: 'commitments', element: <CommitmentsPage /> },
                          { path: 'whatif', element: <WhatIfPage /> },
                          { path: 'showback', element: <ShowbackPage /> },
                          { path: 'savings', element: <SavingsPage /> },
                        ],
                      },
                      { path: 'recommendations', element: <RecommendationsPage /> },
                      { path: 'settings/governance', element: <GovernanceSettingsPage /> },
                      { path: 'settings/ai', element: <AiSettingsPage /> },
                      { path: 'reports', element: <ReportsPage /> },
                      { path: 'settings/branding', element: <BrandingPage /> },
                      { path: 'settings/alerts', element: <AlertsPage /> },
                      { path: 'settings/billing', element: <BillingPage /> },
                      { path: 'settings/custom-rules', element: <CustomRulesPage /> },
                      { path: 'settings/connections', element: <ConnectionsPage /> },
                      { path: 'settings/connections/new', element: <ConnectionWizard /> },
                      {
                        path: 'settings/connections/:connectionId',
                        element: <ConnectionDetailPage />,
                      },
                      { path: 'settings/team', element: <TeamPage /> },
                      { path: 'settings/profile', element: <ProfilePage /> },
                      { path: 'settings/audit', element: <OrgAuditPage /> },
                      { path: 'notifications', element: <NotificationsPage /> },
                      { path: '*', element: <Navigate to="/app" replace /> },
                    ],
                  },
                ],
              },
            ],
          },
          {
            path: 'owner',
            element: <RequireState states={['active']} ownerOnly />,
            children: [
              {
                element: <OwnerShell />,
                children: [
                  {
                    element: <InShell />,
                    errorElement: <RouteError inShell />,
                    children: [
                      { index: true, element: <OwnerOverviewPage /> },
                      { path: 'approvals', element: <ApprovalsPage /> },
                      { path: 'orgs', element: <OrgsPage /> },
                      { path: 'orgs/:orgId', element: <OrgDetailPage /> },
                      { path: 'users', element: <UsersPage /> },
                      { path: 'plans', element: <PlansPage /> },
                      { path: 'business', element: <BusinessPage /> },
                      { path: 'health', element: <HealthPage /> },
                      { path: 'announcements', element: <AnnouncementsPage /> },
                      { path: 'feature-flags', element: <FeatureFlagsPage /> },
                      { path: 'email-templates', element: <EmailTemplatesPage /> },
                      { path: 'retirements', element: <RetirementsPage /> },
                      { path: 'audit', element: <OwnerAuditPage /> },
                      { path: 'notifications', element: <NotificationsPage /> },
                      { path: 'profile', element: <ProfilePage /> },
                      { path: '*', element: <Navigate to="/owner" replace /> },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      { element: <PublicLayout />, children: [{ path: '*', element: <NotFoundPage /> }] },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
