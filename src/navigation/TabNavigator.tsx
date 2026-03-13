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
import FinanceCompareScreen from '../screens/FinanceCompareScreen';
import PoliticsCompareScreen from '../screens/PoliticsCompareScreen';
import BillScreen from '../screens/BillScreen';
import ComingSoonScreen from '../screens/ComingSoonScreen';
import SettingsScreen from '../screens/SettingsScreen';

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
        name="PoliticsCompare"
        component={PoliticsCompareScreen}
        options={{ title: 'Compare Members' }}
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
      <FinanceStack.Screen
        name="FinanceCompare"
        component={FinanceCompareScreen}
        options={{ title: 'Compare Institutions' }}
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
