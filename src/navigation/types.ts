/**
 * Navigation route param types for type-safe navigation.
 *
 * Usage in screens:
 *   import type { PoliticsStackParamList } from '../navigation/types';
 *   const navigation = useNavigation<NativeStackNavigationProp<PoliticsStackParamList>>();
 *   const route = useRoute<RouteProp<PoliticsStackParamList, 'PersonDetail'>>();
 */

// ── Home Stack ──
export type HomeStackParamList = {
  HomeMain: undefined;
  ComingSoon: { title?: string };
};

// ── Politics Stack ──
export type PoliticsStackParamList = {
  PoliticsDashboard: undefined;
  PeopleDirectory: undefined;
  PersonDetail: { person_id: string };
  BillDetail: { bill_id: string };
};

// ── Finance Stack ──
export type FinanceStackParamList = {
  FinanceDashboard: undefined;
  InstitutionsDirectory: undefined;
  InstitutionDetail: { institution_id: string };
};

// ── Health Stack ──
export type HealthStackParamList = {
  HealthDashboard: undefined;
  CompaniesDirectory: undefined;
  CompanyDetail: { company_id: string };
};

// ── Technology Stack ──
export type TechnologyStackParamList = {
  TechDashboard: undefined;
  TechCompaniesDirectory: undefined;
  TechCompanyDetail: { company_id: string };
  TechCompare: { ids: string[] };
};

// ── Bottom Tabs ──
export type RootTabParamList = {
  HomeTab: undefined;
  PoliticsTab: undefined;
  FinanceTab: undefined;
  HealthTab: undefined;
  TechnologyTab: undefined;
  SettingsTab: undefined;
};
