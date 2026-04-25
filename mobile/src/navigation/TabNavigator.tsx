import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';

import HomeScreen from '../screens/HomeScreen';
import PoliticsDashboardScreen from '../screens/PoliticsDashboardScreen';
import PeopleScreen from '../screens/PeopleScreen';
import PersonScreen from '../screens/PersonScreen';
import FinanceDashboardScreen from '../screens/FinanceDashboardScreen';
import InstitutionsScreen from '../screens/InstitutionsScreen';
import InstitutionScreen from '../screens/InstitutionScreen';
import HealthDashboardScreen from '../screens/HealthDashboardScreen';
import CompaniesScreen from '../screens/CompaniesScreen';
import CompanyScreen from '../screens/CompanyScreen';
import TechDashboardScreen from '../screens/TechDashboardScreen';
import TechCompaniesScreen from '../screens/TechCompaniesScreen';
import TechCompanyScreen from '../screens/TechCompanyScreen';
import TechCompareScreen from '../screens/TechCompareScreen';
import BillScreen from '../screens/BillScreen';
import ComingSoonScreen from '../screens/ComingSoonScreen';
import SettingsScreen from '../screens/SettingsScreen';

// Sector screens (dashboard + directory). Detail screens unified via SectorCompanyScreen.
import EnergyDashboardScreen from '../screens/EnergyDashboardScreen';
import EnergyCompaniesScreen from '../screens/EnergyCompaniesScreen';
import TransportationDashboardScreen from '../screens/TransportationDashboardScreen';
import TransportationCompaniesScreen from '../screens/TransportationCompaniesScreen';
import DefenseDashboardScreen from '../screens/DefenseDashboardScreen';
import DefenseCompaniesScreen from '../screens/DefenseCompaniesScreen';
import ChemicalsDashboardScreen from '../screens/ChemicalsDashboardScreen';
import ChemicalsCompaniesScreen from '../screens/ChemicalsCompaniesScreen';
import AgricultureDashboardScreen from '../screens/AgricultureDashboardScreen';
import AgricultureCompaniesScreen from '../screens/AgricultureCompaniesScreen';
import TelecomDashboardScreen from '../screens/TelecomDashboardScreen';
import TelecomCompaniesScreen from '../screens/TelecomCompaniesScreen';
import EducationDashboardScreen from '../screens/EducationDashboardScreen';
import EducationCompaniesScreen from '../screens/EducationCompaniesScreen';

// Generic sector company detail — one component, 7 sectors
import SectorCompanyScreen from '../screens/SectorCompanyScreen';
// Committees
import CommitteesScreen from '../screens/CommitteesScreen';
import CommitteeDetailScreen from '../screens/CommitteeDetailScreen';

import CongressionalTradesScreen from '../screens/CongressionalTradesScreen';
import ZipLookupScreen from '../screens/ZipLookupScreen';
import StoriesScreen from '../screens/StoriesScreen';
import AnomaliesScreen from '../screens/AnomaliesScreen';
import StateExplorerScreen from '../screens/StateExplorerScreen';
import ChatAgentScreen from '../screens/ChatAgentScreen';
import InfluenceNetworkScreen from '../screens/InfluenceNetworkScreen';
import CompareScreen from '../screens/CompareScreen';
import LegislationTrackerScreen from '../screens/LegislationTrackerScreen';
import ActivityFeedScreen from '../screens/ActivityFeedScreen';

// Wave A (civic + cross-sector trackers + detail views)
import BadgesScreen from '../screens/BadgesScreen';
import CivicHubScreen from '../screens/CivicHubScreen';
import PromiseDetailScreen from '../screens/PromiseDetailScreen';
import VoteDetailScreen from '../screens/VoteDetailScreen';
import ClaimDetailScreen from '../screens/ClaimDetailScreen';
import SectorContractsScreen from '../screens/SectorContractsScreen';
import SectorEnforcementScreen from '../screens/SectorEnforcementScreen';
import SectorLobbyingScreen from '../screens/SectorLobbyingScreen';
import EnforcementTrackerScreen from '../screens/EnforcementTrackerScreen';

// Wave B (simple influence views)
import LobbyingBreakdownScreen from '../screens/LobbyingBreakdownScreen';
import ContractTimelineScreen from '../screens/ContractTimelineScreen';
import InfluenceTimelineScreen from '../screens/InfluenceTimelineScreen';

// Wave C auth
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import AccountScreen from '../screens/AccountScreen';

// Wave C rest — civic + influence + data + state
import CivicVerifyScreen from '../screens/CivicVerifyScreen';
import InfluenceExplorerScreen from '../screens/InfluenceExplorerScreen';
import InfluenceMapScreen from '../screens/InfluenceMapScreen';
import MoneyFlowScreen from '../screens/MoneyFlowScreen';
import ClosedLoopScreen from '../screens/ClosedLoopScreen';
import DataExplorerScreen from '../screens/DataExplorerScreen';
import DataStoryScreen from '../screens/DataStoryScreen';
import StateDashboardScreen from '../screens/StateDashboardScreen';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const PoliticsStack = createNativeStackNavigator();
const FinanceStack = createNativeStackNavigator();
const HealthStack = createNativeStackNavigator();
const TechnologyStack = createNativeStackNavigator();

const stackScreenOptions = {
  headerStyle: {
    backgroundColor: UI_COLORS.PRIMARY_BG,
  },
  headerTintColor: UI_COLORS.TEXT_PRIMARY,
  headerTitleStyle: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 18,
    fontWeight: '800' as const,
  },
  headerShadowVisible: false,
  headerBackTitleVisible: false,
};

function HomeStackScreen() {
  return (
    <HomeStack.Navigator screenOptions={stackScreenOptions}>
      <HomeStack.Screen
        name="HomeMain"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <HomeStack.Screen
        name="ComingSoon"
        component={ComingSoonScreen}
        options={{ title: 'Coming Soon' }}
      />
      {/* Cross-stack routes registered locally so Home-tab screens can
          navigate to Person/Bill/Committee detail without stack hopping. */}
      <HomeStack.Screen
        name="PersonDetail"
        component={PersonScreen}
        options={{ title: '' }}
      />
      <HomeStack.Screen
        name="BillDetail"
        component={BillScreen}
        options={{ title: '' }}
      />
      <HomeStack.Screen
        name="CommitteeDetail"
        component={CommitteeDetailScreen}
        options={{ title: '' }}
      />
      {/* Energy sector */}
      <HomeStack.Screen
        name="EnergyDashboard"
        component={EnergyDashboardScreen}
        options={{ title: 'Energy' }}
      />
      <HomeStack.Screen
        name="EnergyCompaniesDirectory"
        component={EnergyCompaniesScreen}
        options={{ title: 'Energy Companies' }}
      />
      <HomeStack.Screen
        name="EnergyCompanyDetail"
        component={SectorCompanyScreen}
        initialParams={{ sector: 'energy' }}
        options={{ title: '' }}
      />
      {/* Transportation sector */}
      <HomeStack.Screen
        name="TransportationDashboard"
        component={TransportationDashboardScreen}
        options={{ title: 'Transportation' }}
      />
      <HomeStack.Screen
        name="TransportationCompaniesDirectory"
        component={TransportationCompaniesScreen}
        options={{ title: 'Transportation Companies' }}
      />
      <HomeStack.Screen
        name="TransportationCompanyDetail"
        component={SectorCompanyScreen}
        initialParams={{ sector: 'transportation' }}
        options={{ title: '' }}
      />
      {/* Defense sector */}
      <HomeStack.Screen
        name="DefenseDashboard"
        component={DefenseDashboardScreen}
        options={{ title: 'Defense' }}
      />
      <HomeStack.Screen
        name="DefenseCompaniesDirectory"
        component={DefenseCompaniesScreen}
        options={{ title: 'Defense Companies' }}
      />
      <HomeStack.Screen
        name="DefenseCompanyDetail"
        component={SectorCompanyScreen}
        initialParams={{ sector: 'defense' }}
        options={{ title: '' }}
      />
      {/* Chemicals sector */}
      <HomeStack.Screen
        name="ChemicalsDashboard"
        component={ChemicalsDashboardScreen}
        options={{ title: 'Chemicals' }}
      />
      <HomeStack.Screen
        name="ChemicalsCompaniesDirectory"
        component={ChemicalsCompaniesScreen}
        options={{ title: 'Chemicals Companies' }}
      />
      <HomeStack.Screen
        name="ChemicalsCompanyDetail"
        component={SectorCompanyScreen}
        initialParams={{ sector: 'chemicals' }}
        options={{ title: '' }}
      />
      {/* Agriculture sector */}
      <HomeStack.Screen
        name="AgricultureDashboard"
        component={AgricultureDashboardScreen}
        options={{ title: 'Agriculture' }}
      />
      <HomeStack.Screen
        name="AgricultureCompaniesDirectory"
        component={AgricultureCompaniesScreen}
        options={{ title: 'Agriculture Companies' }}
      />
      <HomeStack.Screen
        name="AgricultureCompanyDetail"
        component={SectorCompanyScreen}
        initialParams={{ sector: 'agriculture' }}
        options={{ title: '' }}
      />
      {/* Telecom sector */}
      <HomeStack.Screen
        name="TelecomDashboard"
        component={TelecomDashboardScreen}
        options={{ title: 'Telecom' }}
      />
      <HomeStack.Screen
        name="TelecomCompaniesDirectory"
        component={TelecomCompaniesScreen}
        options={{ title: 'Telecom Companies' }}
      />
      <HomeStack.Screen
        name="TelecomCompanyDetail"
        component={SectorCompanyScreen}
        initialParams={{ sector: 'telecom' }}
        options={{ title: '' }}
      />
      {/* Education sector */}
      <HomeStack.Screen
        name="EducationDashboard"
        component={EducationDashboardScreen}
        options={{ title: 'Education' }}
      />
      <HomeStack.Screen
        name="EducationCompaniesDirectory"
        component={EducationCompaniesScreen}
        options={{ title: 'Education Companies' }}
      />
      <HomeStack.Screen
        name="EducationCompanyDetail"
        component={SectorCompanyScreen}
        initialParams={{ sector: 'education' }}
        options={{ title: '' }}
      />
      {/* Quick Tools */}
      <HomeStack.Screen
        name="CongressionalTrades"
        component={CongressionalTradesScreen}
        options={{ title: 'Congressional Trades' }}
      />
      <HomeStack.Screen
        name="ZipLookup"
        component={ZipLookupScreen}
        options={{ title: 'ZIP Code Lookup' }}
      />
      <HomeStack.Screen
        name="Stories"
        component={StoriesScreen}
        options={{ title: 'Stories' }}
      />
      <HomeStack.Screen
        name="Anomalies"
        component={AnomaliesScreen}
        options={{ title: 'Anomalies' }}
      />
      <HomeStack.Screen
        name="StateExplorer"
        component={StateExplorerScreen}
        options={{ title: 'State Explorer' }}
      />
      <HomeStack.Screen
        name="ChatAgent"
        component={ChatAgentScreen}
        options={{ title: 'Ask WTP' }}
      />
      <HomeStack.Screen
        name="InfluenceNetwork"
        component={InfluenceNetworkScreen}
        options={{ title: 'Influence Network' }}
      />
      <HomeStack.Screen
        name="Compare"
        component={CompareScreen}
        options={{ title: 'Compare' }}
      />
      <HomeStack.Screen
        name="LegislationTracker"
        component={LegislationTrackerScreen}
        options={{ title: 'Legislation Tracker' }}
      />
      <HomeStack.Screen
        name="Committees"
        component={CommitteesScreen}
        options={{ title: 'Committees' }}
      />
      <HomeStack.Screen
        name="ActivityFeed"
        component={ActivityFeedScreen}
        options={{ title: 'Activity Feed' }}
      />
      {/* Wave A: civic + cross-sector trackers + detail views */}
      <HomeStack.Screen
        name="CivicHub"
        component={CivicHubScreen}
        options={{ title: 'Civic Hub' }}
      />
      <HomeStack.Screen
        name="Badges"
        component={BadgesScreen}
        options={{ title: 'Civic Badges' }}
      />
      <HomeStack.Screen
        name="PromiseDetail"
        component={PromiseDetailScreen}
        options={{ title: 'Promise' }}
      />
      <HomeStack.Screen
        name="VoteDetail"
        component={VoteDetailScreen}
        options={{ title: 'Vote' }}
      />
      <HomeStack.Screen
        name="ClaimDetail"
        component={ClaimDetailScreen}
        options={{ title: 'Claim' }}
      />
      <HomeStack.Screen
        name="SectorContracts"
        component={SectorContractsScreen}
        options={{ title: 'Contracts' }}
      />
      <HomeStack.Screen
        name="SectorEnforcement"
        component={SectorEnforcementScreen}
        options={{ title: 'Enforcement' }}
      />
      <HomeStack.Screen
        name="SectorLobbying"
        component={SectorLobbyingScreen}
        options={{ title: 'Lobbying' }}
      />
      <HomeStack.Screen
        name="EnforcementTracker"
        component={EnforcementTrackerScreen}
        options={{ title: 'Enforcement Tracker' }}
      />
      {/* Wave B: simple influence views */}
      <HomeStack.Screen
        name="LobbyingBreakdown"
        component={LobbyingBreakdownScreen}
        options={{ title: 'Lobbying Breakdown' }}
      />
      <HomeStack.Screen
        name="ContractTimeline"
        component={ContractTimelineScreen}
        options={{ title: 'Contract Timeline' }}
      />
      <HomeStack.Screen
        name="InfluenceTimeline"
        component={InfluenceTimelineScreen}
        options={{ title: 'Influence Timeline' }}
      />
      {/* Wave C: auth */}
      <HomeStack.Screen
        name="Login"
        component={LoginScreen}
        options={{ title: 'Sign in' }}
      />
      <HomeStack.Screen
        name="Signup"
        component={SignupScreen}
        options={{ title: 'Create account' }}
      />
      <HomeStack.Screen
        name="Account"
        component={AccountScreen}
        options={{ title: 'Account' }}
      />
      {/* Wave C: civic + influence + data + state */}
      <HomeStack.Screen
        name="CivicVerify"
        component={CivicVerifyScreen}
        options={{ title: 'Verify residence' }}
      />
      <HomeStack.Screen
        name="InfluenceExplorer"
        component={InfluenceExplorerScreen}
        options={{ title: 'Influence Explorer' }}
      />
      <HomeStack.Screen
        name="InfluenceMap"
        component={InfluenceMapScreen}
        options={{ title: 'Spend by State' }}
      />
      <HomeStack.Screen
        name="MoneyFlow"
        component={MoneyFlowScreen}
        options={{ title: 'Money Flow' }}
      />
      <HomeStack.Screen
        name="ClosedLoop"
        component={ClosedLoopScreen}
        options={{ title: 'Closed Loops' }}
      />
      <HomeStack.Screen
        name="DataExplorer"
        component={DataExplorerScreen}
        options={{ title: 'Data Explorer' }}
      />
      <HomeStack.Screen
        name="DataStory"
        component={DataStoryScreen}
        options={{ title: 'State of the Data' }}
      />
      <HomeStack.Screen
        name="StateDashboard"
        component={StateDashboardScreen}
        options={{ title: '' }}
      />
    </HomeStack.Navigator>
  );
}

function PoliticsStackScreen() {
  return (
    <PoliticsStack.Navigator screenOptions={stackScreenOptions}>
      <PoliticsStack.Screen
        name="PoliticsDashboard"
        component={PoliticsDashboardScreen}
        options={{ title: 'Politics' }}
      />
      <PoliticsStack.Screen
        name="PeopleDirectory"
        component={PeopleScreen}
        options={{ title: 'People' }}
      />
      <PoliticsStack.Screen
        name="PersonDetail"
        component={PersonScreen}
        options={{ title: '' }}
      />
      <PoliticsStack.Screen
        name="BillDetail"
        component={BillScreen}
        options={{ title: '' }}
      />
      <PoliticsStack.Screen
        name="CommitteeDetail"
        component={CommitteeDetailScreen}
        options={{ title: '' }}
      />
    </PoliticsStack.Navigator>
  );
}

function FinanceStackScreen() {
  return (
    <FinanceStack.Navigator screenOptions={stackScreenOptions}>
      <FinanceStack.Screen
        name="FinanceDashboard"
        component={FinanceDashboardScreen}
        options={{ title: 'Finance' }}
      />
      <FinanceStack.Screen
        name="InstitutionsDirectory"
        component={InstitutionsScreen}
        options={{ title: 'Institutions' }}
      />
      <FinanceStack.Screen
        name="InstitutionDetail"
        component={InstitutionScreen}
        options={{ title: '' }}
      />
      {/* Cross-stack */}
      <FinanceStack.Screen
        name="PersonDetail"
        component={PersonScreen}
        options={{ title: '' }}
      />
    </FinanceStack.Navigator>
  );
}

function HealthStackScreen() {
  return (
    <HealthStack.Navigator screenOptions={stackScreenOptions}>
      <HealthStack.Screen
        name="HealthDashboard"
        component={HealthDashboardScreen}
        options={{ title: 'Health' }}
      />
      <HealthStack.Screen
        name="CompaniesDirectory"
        component={CompaniesScreen}
        options={{ title: 'Companies' }}
      />
      <HealthStack.Screen
        name="CompanyDetail"
        component={CompanyScreen}
        options={{ title: '' }}
      />
      {/* Cross-stack */}
      <HealthStack.Screen
        name="PersonDetail"
        component={PersonScreen}
        options={{ title: '' }}
      />
    </HealthStack.Navigator>
  );
}

function TechnologyStackScreen() {
  return (
    <TechnologyStack.Navigator screenOptions={stackScreenOptions}>
      <TechnologyStack.Screen
        name="TechDashboard"
        component={TechDashboardScreen}
        options={{ title: 'Technology' }}
      />
      <TechnologyStack.Screen
        name="TechCompaniesDirectory"
        component={TechCompaniesScreen}
        options={{ title: 'Companies' }}
      />
      <TechnologyStack.Screen
        name="TechCompanyDetail"
        component={TechCompanyScreen}
        options={{ title: '' }}
      />
      <TechnologyStack.Screen
        name="TechCompare"
        component={TechCompareScreen}
        options={{ title: 'Compare Companies' }}
      />
      {/* Cross-stack */}
      <TechnologyStack.Screen
        name="PersonDetail"
        component={PersonScreen}
        options={{ title: '' }}
      />
    </TechnologyStack.Navigator>
  );
}

const TAB_ICONS: Record<string, { focused: IoniconsName; default: IoniconsName }> = {
  HomeTab: { focused: 'home', default: 'home-outline' },
  PoliticsTab: { focused: 'business', default: 'business-outline' },
  FinanceTab: { focused: 'trending-up', default: 'trending-up-outline' },
  HealthTab: { focused: 'medkit', default: 'medkit-outline' },
  TechnologyTab: { focused: 'hardware-chip', default: 'hardware-chip-outline' },
  SettingsTab: { focused: 'settings', default: 'settings-outline' },
};

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const icons = TAB_ICONS[route.name];
          if (!icons) return null;
          const iconName = focused ? icons.focused : icons.default;
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: UI_COLORS.TAB_ACTIVE,
        tabBarInactiveTintColor: UI_COLORS.TAB_INACTIVE,
        tabBarStyle: {
          backgroundColor: UI_COLORS.PRIMARY_BG,
          borderTopColor: UI_COLORS.BORDER,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600' as const,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStackScreen}
        options={{ title: 'Home' }}
      />
      <Tab.Screen
        name="PoliticsTab"
        component={PoliticsStackScreen}
        options={{ title: 'Politics' }}
      />
      <Tab.Screen
        name="FinanceTab"
        component={FinanceStackScreen}
        options={{ title: 'Finance' }}
      />
      <Tab.Screen
        name="HealthTab"
        component={HealthStackScreen}
        options={{ title: 'Health' }}
      />
      <Tab.Screen
        name="TechnologyTab"
        component={TechnologyStackScreen}
        options={{ title: 'Tech' }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          headerShown: true,
          headerStyle: { backgroundColor: UI_COLORS.PRIMARY_BG },
          headerTintColor: UI_COLORS.TEXT_PRIMARY,
          headerTitleStyle: {
            color: UI_COLORS.TEXT_PRIMARY,
            fontSize: 18,
            fontWeight: '800',
          },
          headerShadowVisible: false,
        }}
      />
    </Tab.Navigator>
  );
}
