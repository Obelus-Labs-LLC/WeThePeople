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
import ComingSoonScreen from '../screens/ComingSoonScreen';
import SettingsScreen from '../screens/SettingsScreen';

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
        component={ComingSoonPlaceholder}
        options={{ title: 'Influence Explorer' }}
      />
      <HomeStack.Screen
        name="InfluenceNetwork"
        component={ComingSoonPlaceholder}
        options={{ title: 'Influence Network' }}
      />
      <HomeStack.Screen
        name="SpendingMap"
        component={ComingSoonPlaceholder}
        options={{ title: 'Spending Map' }}
      />
      <HomeStack.Screen
        name="Methodology"
        component={ComingSoonPlaceholder}
        options={{ title: 'Methodology' }}
      />
      <HomeStack.Screen
        name="About"
        component={ComingSoonPlaceholder}
        options={{ title: 'About' }}
      />
      <HomeStack.Screen
        name="GlobalSearch"
        component={GlobalSearchPlaceholder}
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
        component={ComingSoonPlaceholder}
        options={{ title: 'Legislation Tracker' }}
      />
      <PoliticsStack.Screen
        name="Committees"
        component={ComingSoonPlaceholder}
        options={{ title: 'Committees' }}
      />
      <PoliticsStack.Screen
        name="ActivityFeed"
        component={ComingSoonPlaceholder}
        options={{ title: 'Activity Feed' }}
      />
      <PoliticsStack.Screen
        name="CongressionalTrades"
        component={ComingSoonPlaceholder}
        options={{ title: 'Congressional Trades' }}
      />
      <PoliticsStack.Screen
        name="FindRep"
        component={ComingSoonPlaceholder}
        options={{ title: 'Find Your Representative' }}
      />
      <PoliticsStack.Screen
        name="StateExplorer"
        component={ComingSoonPlaceholder}
        options={{ title: 'State Explorer' }}
      />
      <PoliticsStack.Screen
        name="StateDashboard"
        component={ComingSoonPlaceholder}
        options={{ title: 'State Dashboard' }}
      />
      <PoliticsStack.Screen
        name="PoliticsLobbying"
        component={ComingSoonPlaceholder}
        options={{ title: 'Political Lobbying' }}
      />
      <PoliticsStack.Screen
        name="PoliticsContracts"
        component={ComingSoonPlaceholder}
        options={{ title: 'Government Contracts' }}
      />
      <PoliticsStack.Screen
        name="PoliticsEnforcement"
        component={ComingSoonPlaceholder}
        options={{ title: 'Enforcement Actions' }}
      />
      <PoliticsStack.Screen
        name="GlobalSearch"
        component={GlobalSearchPlaceholder}
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
        component={ComingSoonPlaceholder}
        options={{ title: 'Insider Trades' }}
      />
      <FinanceStack.Screen
        name="MacroIndicators"
        component={ComingSoonPlaceholder}
        options={{ title: 'Macro Indicators' }}
      />
      <FinanceStack.Screen
        name="ComplaintsDashboard"
        component={ComingSoonPlaceholder}
        options={{ title: 'CFPB Complaints' }}
      />
      <FinanceStack.Screen
        name="FinanceLobbying"
        component={ComingSoonPlaceholder}
        options={{ title: 'Finance Lobbying' }}
      />
      <FinanceStack.Screen
        name="FinanceContracts"
        component={ComingSoonPlaceholder}
        options={{ title: 'Finance Contracts' }}
      />
      <FinanceStack.Screen
        name="FinanceEnforcement"
        component={ComingSoonPlaceholder}
        options={{ title: 'Finance Enforcement' }}
      />
      <FinanceStack.Screen
        name="GlobalSearch"
        component={GlobalSearchPlaceholder}
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
        component={ComingSoonPlaceholder}
        options={{ title: 'Compare Companies' }}
      />
      <HealthStack.Screen
        name="DrugLookup"
        component={ComingSoonPlaceholder}
        options={{ title: 'Drug Lookup' }}
      />
      <HealthStack.Screen
        name="ClinicalPipeline"
        component={ComingSoonPlaceholder}
        options={{ title: 'Clinical Pipeline' }}
      />
      <HealthStack.Screen
        name="HealthLobbying"
        component={ComingSoonPlaceholder}
        options={{ title: 'Health Lobbying' }}
      />
      <HealthStack.Screen
        name="HealthContracts"
        component={ComingSoonPlaceholder}
        options={{ title: 'Health Contracts' }}
      />
      <HealthStack.Screen
        name="HealthEnforcement"
        component={ComingSoonPlaceholder}
        options={{ title: 'Health Enforcement' }}
      />
      <HealthStack.Screen
        name="GlobalSearch"
        component={GlobalSearchPlaceholder}
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
        component={ComingSoonPlaceholder}
        options={{ title: 'Compare Companies' }}
      />
      <EnergyStack.Screen
        name="EnergyLobbying"
        component={ComingSoonPlaceholder}
        options={{ title: 'Energy Lobbying' }}
      />
      <EnergyStack.Screen
        name="EnergyContracts"
        component={ComingSoonPlaceholder}
        options={{ title: 'Energy Contracts' }}
      />
      <EnergyStack.Screen
        name="EnergyEnforcement"
        component={ComingSoonPlaceholder}
        options={{ title: 'Energy Enforcement' }}
      />
      <EnergyStack.Screen
        name="GlobalSearch"
        component={GlobalSearchPlaceholder}
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
        component={ComingSoonPlaceholder}
        options={{ title: 'Tech Lobbying' }}
      />
      <TechnologyStack.Screen
        name="TechContracts"
        component={ComingSoonPlaceholder}
        options={{ title: 'Tech Contracts' }}
      />
      <TechnologyStack.Screen
        name="TechEnforcement"
        component={ComingSoonPlaceholder}
        options={{ title: 'Tech Enforcement' }}
      />
      <TechnologyStack.Screen
        name="GlobalSearch"
        component={GlobalSearchPlaceholder}
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
