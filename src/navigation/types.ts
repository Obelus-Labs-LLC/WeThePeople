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
  InfluenceExplorer: undefined;
  InfluenceNetwork: { entityType?: string; entityId?: string };
  SpendingMap: undefined;
  Methodology: undefined;
  About: undefined;
  MoneyFlow: undefined;
  DataExplorer: undefined;
  DataStory: undefined;
  InfluenceTimeline: undefined;
  ClosedLoop: undefined;
  PrivacyPolicy: undefined;
  TermsOfUse: undefined;
  Disclaimer: undefined;
  GlobalSearch: undefined;
};

// ── Politics Stack ──
export type PoliticsStackParamList = {
  PoliticsDashboard: undefined;
  PeopleDirectory: undefined;
  PersonDetail: { person_id: string };
  BillDetail: { bill_id: string };
  PoliticsCompare: undefined;
  LegislationTracker: undefined;
  Committees: undefined;
  ActivityFeed: undefined;
  CongressionalTrades: undefined;
  FindRep: undefined;
  StateExplorer: undefined;
  StateDashboard: { state_code: string };
  PoliticsLobbying: undefined;
  PoliticsContracts: undefined;
  PoliticsEnforcement: undefined;
  BalanceOfPower: undefined;
  VoteDetail: { vote_id: string };
  PressTools: undefined;
  GlobalSearch: undefined;
};

// ── Finance Stack ──
export type FinanceStackParamList = {
  FinanceDashboard: undefined;
  InstitutionsDirectory: undefined;
  InstitutionDetail: { institution_id: string };
  FinanceCompare: undefined;
  InsiderTrades: undefined;
  MacroIndicators: undefined;
  ComplaintsDashboard: undefined;
  FinanceLobbying: undefined;
  FinanceContracts: undefined;
  FinanceEnforcement: undefined;
  MarketMovers: undefined;
  GlobalSearch: undefined;
};

// ── Health Stack ──
export type HealthStackParamList = {
  HealthDashboard: undefined;
  CompaniesDirectory: undefined;
  CompanyDetail: { company_id: string };
  HealthCompare: undefined;
  DrugLookup: undefined;
  ClinicalPipeline: undefined;
  HealthLobbying: undefined;
  HealthContracts: undefined;
  HealthEnforcement: undefined;
  FDAApprovals: undefined;
  GlobalSearch: undefined;
};

// ── Technology Stack ──
export type TechnologyStackParamList = {
  TechDashboard: undefined;
  TechCompaniesDirectory: undefined;
  TechCompanyDetail: { company_id: string };
  TechCompare: { ids: string[] };
  TechLobbying: undefined;
  TechContracts: undefined;
  TechEnforcement: undefined;
  PatentSearch: undefined;
  GlobalSearch: undefined;
};

// ── Energy Stack ──
export type EnergyStackParamList = {
  EnergyDashboard: undefined;
  EnergyCompaniesDirectory: undefined;
  EnergyCompanyDetail: { company_id: string };
  EnergyCompare: undefined;
  EnergyLobbying: undefined;
  EnergyContracts: undefined;
  EnergyEnforcement: undefined;
  GlobalSearch: undefined;
};

// ── Transportation Stack ──
export type TransportationStackParamList = {
  TransportationDashboard: undefined;
  TransportationCompaniesDirectory: undefined;
  TransportationCompanyDetail: { company_id: string };
  TransportationCompare: undefined;
  TransportationLobbying: undefined;
  TransportationContracts: undefined;
  TransportationEnforcement: undefined;
  GlobalSearch: undefined;
};

// ── Bottom Tabs ──
export type RootTabParamList = {
  HomeTab: undefined;
  PoliticsTab: undefined;
  FinanceTab: undefined;
  HealthTab: undefined;
  EnergyTab: undefined;
  TechnologyTab: undefined;
  TransportationTab: undefined;
  SettingsTab: undefined;
};
