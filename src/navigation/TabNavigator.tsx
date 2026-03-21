import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
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
import EnergyDashboardScreen from '../screens/EnergyDashboardScreen';
import EnergyCompaniesScreen from '../screens/EnergyCompaniesScreen';
import EnergyCompanyScreen from '../screens/EnergyCompanyScreen';
import TechDashboardScreen from '../screens/TechDashboardScreen';
import TechCompaniesScreen from '../screens/TechCompaniesScreen';
import TechCompanyScreen from '../screens/TechCompanyScreen';
import TechCompareScreen from '../screens/TechCompareScreen';
import FinanceCompareScreen from '../screens/FinanceCompareScreen';
import PoliticsCompareScreen from '../screens/PoliticsCompareScreen';
import BillScreen from '../screens/BillScreen';
import CommitteesScreen from '../screens/CommitteesScreen';
import ComingSoonScreen from '../screens/ComingSoonScreen';
import SettingsScreen from '../screens/SettingsScreen';

// Real screens replacing ComingSoonPlaceholder
import LegislationTrackerScreen from '../screens/LegislationTrackerScreen';
import ActivityFeedScreen from '../screens/ActivityFeedScreen';
import CongressionalTradesScreen from '../screens/CongressionalTradesScreen';
import FindRepScreen from '../screens/FindRepScreen';
import StateExplorerScreen from '../screens/StateExplorerScreen';
import StateDashboardScreen from '../screens/StateDashboardScreen';
import InsiderTradesScreen from '../screens/InsiderTradesScreen';
import MacroIndicatorsScreen from '../screens/MacroIndicatorsScreen';
import ComplaintsDashboardScreen from '../screens/ComplaintsDashboardScreen';
import HealthCompareScreen from '../screens/HealthCompareScreen';
import DrugLookupScreen from '../screens/DrugLookupScreen';
import ClinicalPipelineScreen from '../screens/ClinicalPipelineScreen';
import EnergyCompareScreen from '../screens/EnergyCompareScreen';
import InfluenceExplorerScreen from '../screens/InfluenceExplorerScreen';
import InfluenceNetworkScreen from '../screens/InfluenceNetworkScreen';
import SpendingMapScreen from '../screens/SpendingMapScreen';
import MethodologyScreen from '../screens/MethodologyScreen';
import AboutScreen from '../screens/AboutScreen';
import GlobalSearchScreen from '../screens/GlobalSearchScreen';
import SectorLobbyingScreen from '../screens/SectorLobbyingScreen';
import SectorContractsScreen from '../screens/SectorContractsScreen';
import SectorEnforcementScreen from '../screens/SectorEnforcementScreen';

// New screens — Session 13 parity
import MoneyFlowScreen from '../screens/MoneyFlowScreen';
import DataExplorerScreen from '../screens/DataExplorerScreen';
import DataStoryScreen from '../screens/DataStoryScreen';
import InfluenceTimelineScreen from '../screens/InfluenceTimelineScreen';
import ClosedLoopScreen from '../screens/ClosedLoopScreen';
import BalanceOfPowerScreen from '../screens/BalanceOfPowerScreen';
import VoteDetailScreen from '../screens/VoteDetailScreen';
import PressToolsScreen from '../screens/PressToolsScreen';
import PatentSearchScreen from '../screens/PatentSearchScreen';
import FDAApprovalsScreen from '../screens/FDAApprovalsScreen';
import MarketMoversScreen from '../screens/MarketMoversScreen';
import PrivacyPolicyScreen from '../screens/PrivacyPolicyScreen';
import TermsOfUseScreen from '../screens/TermsOfUseScreen';
import DisclaimerScreen from '../screens/DisclaimerScreen';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

// ── Placeholder for screens that don't exist yet ──
function ComingSoonPlaceholder({ route }: { route: any }) {
  const title = route?.name || 'Coming Soon';
  return (
    <View style={placeholderStyles.container}>
      <Ionicons name="construct-outline" size={48} color={UI_COLORS.TEXT_MUTED} />
      <Text style={placeholderStyles.title}>{title.replace(/([A-Z])/g, ' $1').trim()}</Text>
      <Text style={placeholderStyles.subtitle}>Coming Soon</Text>
    </View>
  );
}

function GlobalSearchPlaceholder() {
  const navigation = useNavigation();
  return (
    <View style={placeholderStyles.container}>
      <Ionicons name="search" size={48} color={UI_COLORS.TEXT_MUTED} />
      <Text style={placeholderStyles.title}>Global Search</Text>
      <Text style={placeholderStyles.subtitle}>Search across all sectors</Text>
      <TouchableOpacity
        style={placeholderStyles.closeBtn}
        onPress={() => navigation.goBack()}
      >
        <Text style={placeholderStyles.closeBtnText}>Close</Text>
      </TouchableOpacity>
    </View>
  );
}

const placeholderStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_COLORS.PRIMARY_BG,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  title: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 14,
  },
  closeBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: UI_COLORS.ACCENT,
    borderRadius: 8,
  },
  closeBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

// ── Stack Navigators ──
const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const PoliticsStack = createNativeStackNavigator();
const FinanceStack = createNativeStackNavigator();
const HealthStack = createNativeStackNavigator();
const EnergyStack = createNativeStackNavigator();
const TechnologyStack = createNativeStackNavigator();

function createStackScreenOptions(navigation: any) {
  return {
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
    headerRight: () => (
      <TouchableOpacity
        onPress={() => navigation.navigate('GlobalSearch' as never)}
        style={{ marginRight: 12 }}
      >
        <Ionicons name="search" size={22} color={UI_COLORS.TEXT_PRIMARY} />
      </TouchableOpacity>
    ),
  };
}

const baseStackScreenOptions = {
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
  const navigation = useNavigation();
  return (
    <HomeStack.Navigator screenOptions={createStackScreenOptions(navigation)}>
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
      <HomeStack.Screen
        name="InfluenceExplorer"
        component={InfluenceExplorerScreen}
        options={{ title: 'Influence Explorer' }}
      />
      <HomeStack.Screen
        name="InfluenceNetwork"
        component={InfluenceNetworkScreen}
        options={{ title: 'Influence Network' }}
      />
      <HomeStack.Screen
        name="SpendingMap"
        component={SpendingMapScreen}
        options={{ title: 'Spending Map' }}
      />
      <HomeStack.Screen
        name="Methodology"
        component={MethodologyScreen}
        options={{ title: 'Methodology' }}
      />
      <HomeStack.Screen
        name="About"
        component={AboutScreen}
        options={{ title: 'About' }}
      />
      <HomeStack.Screen
        name="MoneyFlow"
        component={MoneyFlowScreen}
        options={{ title: 'Money Flow' }}
      />
      <HomeStack.Screen
        name="DataExplorer"
        component={DataExplorerScreen}
        options={{ title: 'Data Explorer' }}
      />
      <HomeStack.Screen
        name="DataStory"
        component={DataStoryScreen}
        options={{ title: 'Data Story' }}
      />
      <HomeStack.Screen
        name="InfluenceTimeline"
        component={InfluenceTimelineScreen}
        options={{ title: 'Influence Timeline' }}
      />
      <HomeStack.Screen
        name="ClosedLoop"
        component={ClosedLoopScreen}
        options={{ title: 'Closed Loops' }}
      />
      <HomeStack.Screen
        name="PrivacyPolicy"
        component={PrivacyPolicyScreen}
        options={{ title: 'Privacy Policy' }}
      />
      <HomeStack.Screen
        name="TermsOfUse"
        component={TermsOfUseScreen}
        options={{ title: 'Terms of Use' }}
      />
      <HomeStack.Screen
        name="Disclaimer"
        component={DisclaimerScreen}
        options={{ title: 'Disclaimer' }}
      />
      <HomeStack.Screen
        name="GlobalSearch"
        component={GlobalSearchScreen}
        options={{ presentation: 'modal', headerShown: false }}
      />
    </HomeStack.Navigator>
  );
}

function PoliticsStackScreen() {
  const navigation = useNavigation();
  return (
    <PoliticsStack.Navigator screenOptions={createStackScreenOptions(navigation)}>
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
        name="PoliticsCompare"
        component={PoliticsCompareScreen}
        options={{ title: 'Compare Members' }}
      />
      <PoliticsStack.Screen
        name="LegislationTracker"
        component={LegislationTrackerScreen}
        options={{ title: 'Legislation Tracker' }}
      />
      <PoliticsStack.Screen
        name="Committees"
        component={CommitteesScreen}
        options={{ title: 'Committees' }}
      />
      <PoliticsStack.Screen
        name="ActivityFeed"
        component={ActivityFeedScreen}
        options={{ title: 'Activity Feed' }}
      />
      <PoliticsStack.Screen
        name="CongressionalTrades"
        component={CongressionalTradesScreen}
        options={{ title: 'Congressional Trades' }}
      />
      <PoliticsStack.Screen
        name="FindRep"
        component={FindRepScreen}
        options={{ title: 'Find Your Representative' }}
      />
      <PoliticsStack.Screen
        name="StateExplorer"
        component={StateExplorerScreen}
        options={{ title: 'State Explorer' }}
      />
      <PoliticsStack.Screen
        name="StateDashboard"
        component={StateDashboardScreen}
        options={{ title: 'State Dashboard' }}
      />
      <PoliticsStack.Screen
        name="PoliticsLobbying"
        component={SectorLobbyingScreen}
        options={{ title: 'Political Lobbying' }}
        initialParams={{ sector: 'politics' }}
      />
      <PoliticsStack.Screen
        name="PoliticsContracts"
        component={SectorContractsScreen}
        options={{ title: 'Government Contracts' }}
        initialParams={{ sector: 'politics' }}
      />
      <PoliticsStack.Screen
        name="PoliticsEnforcement"
        component={SectorEnforcementScreen}
        options={{ title: 'Enforcement Actions' }}
        initialParams={{ sector: 'politics' }}
      />
      <PoliticsStack.Screen
        name="BalanceOfPower"
        component={BalanceOfPowerScreen}
        options={{ title: 'Balance of Power' }}
      />
      <PoliticsStack.Screen
        name="VoteDetail"
        component={VoteDetailScreen}
        options={{ title: 'Vote Details' }}
      />
      <PoliticsStack.Screen
        name="PressTools"
        component={PressToolsScreen}
        options={{ title: 'Press & News' }}
      />
      <PoliticsStack.Screen
        name="GlobalSearch"
        component={GlobalSearchScreen}
        options={{ presentation: 'modal', headerShown: false }}
      />
    </PoliticsStack.Navigator>
  );
}

function FinanceStackScreen() {
  const navigation = useNavigation();
  return (
    <FinanceStack.Navigator screenOptions={createStackScreenOptions(navigation)}>
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
      <FinanceStack.Screen
        name="FinanceCompare"
        component={FinanceCompareScreen}
        options={{ title: 'Compare Institutions' }}
      />
      <FinanceStack.Screen
        name="InsiderTrades"
        component={InsiderTradesScreen}
        options={{ title: 'Insider Trades' }}
      />
      <FinanceStack.Screen
        name="MacroIndicators"
        component={MacroIndicatorsScreen}
        options={{ title: 'Macro Indicators' }}
      />
      <FinanceStack.Screen
        name="ComplaintsDashboard"
        component={ComplaintsDashboardScreen}
        options={{ title: 'CFPB Complaints' }}
      />
      <FinanceStack.Screen
        name="FinanceLobbying"
        component={SectorLobbyingScreen}
        options={{ title: 'Finance Lobbying' }}
        initialParams={{ sector: 'finance' }}
      />
      <FinanceStack.Screen
        name="FinanceContracts"
        component={SectorContractsScreen}
        options={{ title: 'Finance Contracts' }}
        initialParams={{ sector: 'finance' }}
      />
      <FinanceStack.Screen
        name="FinanceEnforcement"
        component={SectorEnforcementScreen}
        options={{ title: 'Finance Enforcement' }}
        initialParams={{ sector: 'finance' }}
      />
      <FinanceStack.Screen
        name="MarketMovers"
        component={MarketMoversScreen}
        options={{ title: 'Market Movers' }}
      />
      <FinanceStack.Screen
        name="GlobalSearch"
        component={GlobalSearchScreen}
        options={{ presentation: 'modal', headerShown: false }}
      />
    </FinanceStack.Navigator>
  );
}

function HealthStackScreen() {
  const navigation = useNavigation();
  return (
    <HealthStack.Navigator screenOptions={createStackScreenOptions(navigation)}>
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
      <HealthStack.Screen
        name="HealthCompare"
        component={HealthCompareScreen}
        options={{ title: 'Compare Companies' }}
      />
      <HealthStack.Screen
        name="DrugLookup"
        component={DrugLookupScreen}
        options={{ title: 'Drug Lookup' }}
      />
      <HealthStack.Screen
        name="ClinicalPipeline"
        component={ClinicalPipelineScreen}
        options={{ title: 'Clinical Pipeline' }}
      />
      <HealthStack.Screen
        name="HealthLobbying"
        component={SectorLobbyingScreen}
        options={{ title: 'Health Lobbying' }}
        initialParams={{ sector: 'health' }}
      />
      <HealthStack.Screen
        name="HealthContracts"
        component={SectorContractsScreen}
        options={{ title: 'Health Contracts' }}
        initialParams={{ sector: 'health' }}
      />
      <HealthStack.Screen
        name="HealthEnforcement"
        component={SectorEnforcementScreen}
        options={{ title: 'Health Enforcement' }}
        initialParams={{ sector: 'health' }}
      />
      <HealthStack.Screen
        name="FDAApprovals"
        component={FDAApprovalsScreen}
        options={{ title: 'FDA Approvals' }}
      />
      <HealthStack.Screen
        name="GlobalSearch"
        component={GlobalSearchScreen}
        options={{ presentation: 'modal', headerShown: false }}
      />
    </HealthStack.Navigator>
  );
}

function EnergyStackScreen() {
  const navigation = useNavigation();
  return (
    <EnergyStack.Navigator screenOptions={createStackScreenOptions(navigation)}>
      <EnergyStack.Screen
        name="EnergyDashboard"
        component={EnergyDashboardScreen}
        options={{ title: 'Energy' }}
      />
      <EnergyStack.Screen
        name="EnergyCompaniesDirectory"
        component={EnergyCompaniesScreen}
        options={{ title: 'Companies' }}
      />
      <EnergyStack.Screen
        name="EnergyCompanyDetail"
        component={EnergyCompanyScreen}
        options={{ title: '' }}
      />
      <EnergyStack.Screen
        name="EnergyCompare"
        component={EnergyCompareScreen}
        options={{ title: 'Compare Companies' }}
      />
      <EnergyStack.Screen
        name="EnergyLobbying"
        component={SectorLobbyingScreen}
        options={{ title: 'Energy Lobbying' }}
        initialParams={{ sector: 'energy' }}
      />
      <EnergyStack.Screen
        name="EnergyContracts"
        component={SectorContractsScreen}
        options={{ title: 'Energy Contracts' }}
        initialParams={{ sector: 'energy' }}
      />
      <EnergyStack.Screen
        name="EnergyEnforcement"
        component={SectorEnforcementScreen}
        options={{ title: 'Energy Enforcement' }}
        initialParams={{ sector: 'energy' }}
      />
      <EnergyStack.Screen
        name="GlobalSearch"
        component={GlobalSearchScreen}
        options={{ presentation: 'modal', headerShown: false }}
      />
    </EnergyStack.Navigator>
  );
}

function TechnologyStackScreen() {
  const navigation = useNavigation();
  return (
    <TechnologyStack.Navigator screenOptions={createStackScreenOptions(navigation)}>
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
      <TechnologyStack.Screen
        name="TechLobbying"
        component={SectorLobbyingScreen}
        options={{ title: 'Tech Lobbying' }}
        initialParams={{ sector: 'tech' }}
      />
      <TechnologyStack.Screen
        name="TechContracts"
        component={SectorContractsScreen}
        options={{ title: 'Tech Contracts' }}
        initialParams={{ sector: 'tech' }}
      />
      <TechnologyStack.Screen
        name="TechEnforcement"
        component={SectorEnforcementScreen}
        options={{ title: 'Tech Enforcement' }}
        initialParams={{ sector: 'tech' }}
      />
      <TechnologyStack.Screen
        name="PatentSearch"
        component={PatentSearchScreen}
        options={{ title: 'Patent Search' }}
      />
      <TechnologyStack.Screen
        name="GlobalSearch"
        component={GlobalSearchScreen}
        options={{ presentation: 'modal', headerShown: false }}
      />
    </TechnologyStack.Navigator>
  );
}

const TAB_ICONS: Record<string, { focused: IoniconsName; default: IoniconsName }> = {
  HomeTab: { focused: 'home', default: 'home-outline' },
  PoliticsTab: { focused: 'business', default: 'business-outline' },
  FinanceTab: { focused: 'trending-up', default: 'trending-up-outline' },
  HealthTab: { focused: 'medkit', default: 'medkit-outline' },
  EnergyTab: { focused: 'flame', default: 'flame-outline' },
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
        name="EnergyTab"
        component={EnergyStackScreen}
        options={{ title: 'Energy' }}
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
