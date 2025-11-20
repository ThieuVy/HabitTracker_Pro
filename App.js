import React, { useState, useEffect, useContext, createContext } from 'react';
import {
  StyleSheet, Text, View, FlatList, TouchableOpacity,
  TextInput, ScrollView, Alert, Platform, Switch, Modal, SafeAreaView, StatusBar, Image
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { LineChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import moment from 'moment';
import * as Device from 'expo-device';

// ==============================================
// 1. MODERN DESIGN SYSTEM (COLORS & CONFIG)
// ==============================================
const COLORS = {
  primary: '#4F46E5', // Indigo 600
  primarySoft: '#E0E7FF',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  text: '#1E293B',
  subText: '#64748B',
  border: '#E2E8F0',

  danger: '#EF4444',
  success: '#10B981',
  successSoft: '#D1FAE5',

  warningBg: '#FEF3C7',
  warningText: '#92400E',

  accent1: '#F472B6',
  accent2: '#60A5FA',
  accent3: '#A78BFA',
};

const SCREEN_WIDTH = Dimensions.get('window').width;

const AVAILABLE_ICONS = [
  'fitness', 'walk', 'bicycle', 'barbell',
  'book', 'school', 'library', 'language',
  'water', 'cafe', 'restaurant', 'nutrition',
  'moon', 'sunny', 'alarm', 'bed',
  'code', 'laptop', 'desktop', 'game-controller',
  'brush', 'color-palette', 'musical-notes', 'camera'
];

const WEEKDAYS = [
  { key: 'Mon', label: 'M' }, { key: 'Tue', label: 'T' }, { key: 'Wed', label: 'W' },
  { key: 'Thu', label: 'T' }, { key: 'Fri', label: 'F' }, { key: 'Sat', label: 'S' }, { key: 'Sun', label: 'S' },
];

// Notification Setup
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
} catch (error) { console.log("Notif Handler Error:", error); }

// ==============================================
// CONTEXT & LOGIC
// ==============================================
const HabitContext = createContext();

const HabitProvider = ({ children }) => {
  const [habits, setHabits] = useState([]);
  const [reminderTime, setReminderTime] = useState(new Date().setHours(7, 0, 0, 0));
  const [customMessage, setCustomMessage] = useState("It's time to build your habits!");
  const [isRemindersEnabled, setIsRemindersEnabled] = useState(true);

  useEffect(() => { loadData(); safeSetupNotifications(); }, []);
  useEffect(() => { saveData(); if (isRemindersEnabled) safeScheduleNotifications(); else safeCancelNotifications(); }, [habits, reminderTime, customMessage, isRemindersEnabled]);

  const safeSetupNotifications = async () => {
    if (Platform.OS === 'android') return;
    try { await Notifications.requestPermissionsAsync(); } catch (error) { }
  };

  const safeScheduleNotifications = async () => {
    if (Platform.OS === 'android') return;
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      if (habits.length === 0) return;
      const triggerDate = new Date(reminderTime);
      await Notifications.scheduleNotificationAsync({
        content: { title: "Daily Reminder ☀️", body: customMessage },
        trigger: { hour: triggerDate.getHours(), minute: triggerDate.getMinutes(), repeats: true },
      });
      const today = moment().format('YYYY-MM-DD');
      const allCompleted = habits.length > 0 && habits.every(h => h.completedDates.includes(today));
      if (!allCompleted) {
        await Notifications.scheduleNotificationAsync({
          content: { title: "Keep it up! 🌙", body: "Finish your habits to keep the streak!" },
          trigger: { hour: 20, minute: 0, repeats: true },
          identifier: 'smart_reminder_8pm'
        });
      }
    } catch (error) { }
  };

  const safeCancelNotifications = async () => { if (Platform.OS !== 'android') await Notifications.cancelAllScheduledNotificationsAsync(); };
  const safeCancelSpecificNotification = async (id) => { if (Platform.OS !== 'android') await Notifications.cancelScheduledNotificationAsync(id); };

  const loadData = async () => {
    try {
      const h = await AsyncStorage.getItem('habits');
      const s = await AsyncStorage.getItem('settings');
      if (h) setHabits(JSON.parse(h));
      if (s) { const parsed = JSON.parse(s); setReminderTime(parsed.time); setCustomMessage(parsed.message); setIsRemindersEnabled(parsed.enabled); }
    } catch (e) { }
  };
  const saveData = async () => { try { await AsyncStorage.setItem('habits', JSON.stringify(habits)); await AsyncStorage.setItem('settings', JSON.stringify({ time: reminderTime, message: customMessage, enabled: isRemindersEnabled })); } catch (e) { } };
  const updateSettings = (t, m, e) => { setReminderTime(t); setCustomMessage(m); setIsRemindersEnabled(e); };
  const addHabit = (h) => { setHabits([...habits, { id: Date.now().toString(), completedDates: [], startDate: moment().format('YYYY-MM-DD'), color: COLORS.primary, streak: 0, longestStreak: 0, targetDays: [], ...h }]); };
  const updateHabit = (id, f) => { setHabits(habits.map(h => h.id === id ? { ...h, ...f } : h)); };
  const deleteHabit = (id) => { setHabits(habits.filter(h => h.id !== id)); };
  const toggleHabitCompletion = async (id) => {
    const today = moment().format('YYYY-MM-DD');
    const updated = habits.map(h => {
      if (h.id !== id) return h;
      const isCompleted = h.completedDates.includes(today);
      let newDates = isCompleted ? h.completedDates.filter(d => d !== today) : [...h.completedDates, today];
      const sorted = newDates.sort();
      let streak = 0, check = moment();
      if (!newDates.includes(check.format('YYYY-MM-DD'))) check.subtract(1, 'days');
      while (newDates.includes(check.format('YYYY-MM-DD'))) { streak++; check.subtract(1, 'days'); }
      return { ...h, completedDates: newDates, streak, longestStreak: Math.max(streak, h.longestStreak || 0) };
    });
    setHabits(updated);
    if (updated.every(h => h.completedDates.includes(today))) await safeCancelSpecificNotification('smart_reminder_8pm');
  };

  return (
    <HabitContext.Provider value={{ habits, addHabit, updateHabit, deleteHabit, toggleHabitCompletion, settings: { reminderTime, customMessage, isRemindersEnabled }, updateSettings }}>
      {children}
    </HabitContext.Provider>
  );
};

// ==============================================
// COMPONENTS
// ==============================================

const HabitItem = ({ habit, onToggle, onPress }) => {
  const today = moment().format('YYYY-MM-DD');
  const isCompleted = habit.completedDates.includes(today);

  let freqText = 'Daily Goal';
  if (habit.frequency === 'weekly') freqText = 'Weekly Goal';
  if (habit.frequency === 'custom' && habit.targetDays.length > 0) freqText = habit.targetDays.join(', ');

  return (
    <TouchableOpacity
      style={[styles.habitCard, isCompleted && styles.habitCardCompleted]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.cardContent}>
        <View style={[styles.iconBox, { backgroundColor: isCompleted ? COLORS.success : habit.color }]}>
          <Ionicons name={habit.icon} size={22} color={COLORS.white} />
        </View>
        <View style={styles.habitTextContainer}>
          <Text style={[styles.habitTitle, isCompleted && styles.textCompleted]} numberOfLines={1}>
            {habit.title}
          </Text>
          <View style={styles.habitSubRow}>
            <Text style={styles.habitFreq}>{freqText}</Text>
            {habit.streak > 0 && (
              <View style={styles.streakTag}>
                <Ionicons name="flame" size={10} color="#F59E0B" />
                <Text style={styles.streakNum}>{habit.streak}</Text>
              </View>
            )}
          </View>
        </View>
        <TouchableOpacity onPress={onToggle} style={styles.checkboxContainer}>
          {isCompleted ? (
            <View style={styles.checkedCircle}>
              <Ionicons name="checkmark" size={18} color={COLORS.white} />
            </View>
          ) : (
            <View style={[styles.uncheckedCircle, { borderColor: habit.color }]} />
          )}
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

// ==============================================
// SCREENS
// ==============================================

const HomeScreen = ({ navigation }) => {
  const { habits, toggleHabitCompletion } = useContext(HabitContext);
  const today = moment().format('YYYY-MM-DD');
  const completedCount = habits.filter(h => h.completedDates.includes(today)).length;
  const progress = habits.length > 0 ? completedCount / habits.length : 0;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening";

  return (
    <SafeAreaView style={styles.safeContainer}>
      <View style={styles.headerContainer}>
        <View>
          <Text style={styles.greetingText}>{greeting} 👋</Text>
          <Text style={styles.dateText}>{moment().format('dddd, MMM D')}</Text>
        </View>
        <TouchableOpacity style={styles.btnAdd} onPress={() => navigation.navigate('AddHabit')}>
          <Ionicons name="add" size={28} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {habits.length > 0 && (
        <View style={styles.progressBanner}>
          <View>
            <Text style={styles.progressTitle}>Daily Progress</Text>
            <Text style={styles.progressSubtitle}>{completedCount} of {habits.length} completed</Text>
          </View>
          <View style={styles.circularProgress}>
            <Text style={styles.progressPercent}>{Math.round(progress * 100)}%</Text>
          </View>
        </View>
      )}

      <FlatList
        data={habits}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <HabitItem
            habit={item}
            onToggle={() => toggleHabitCompletion(item.id)}
            onPress={() => navigation.navigate('HabitDetail', { habitId: item.id })}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconBg}>
              <Ionicons name="sparkles" size={40} color={COLORS.primary} />
            </View>
            <Text style={styles.emptyTitle}>No habits yet</Text>
            <Text style={styles.emptyDesc}>Create a habit to start your journey to a better version of yourself.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const AddEditHabitScreen = ({ route, navigation }) => {
  const { addHabit, updateHabit, deleteHabit } = useContext(HabitContext);
  const isEditing = route.params?.habit;
  const existing = route.params?.habit || {};

  const [title, setTitle] = useState(existing.title || '');
  const [description, setDescription] = useState(existing.description || '');
  const [frequency, setFrequency] = useState(existing.frequency || 'daily');
  const [selectedIcon, setSelectedIcon] = useState(existing.icon || 'fitness');
  const [color, setColor] = useState(existing.color || COLORS.primary);
  const [targetDays, setTargetDays] = useState(existing.targetDays || []);

  const handleSave = () => {
    if (!title.trim()) { Alert.alert("Oops", "Give your habit a name!"); return; }
    const data = { title, description, frequency, icon: selectedIcon, color, targetDays };
    if (isEditing) updateHabit(existing.id, data); else addHabit(data);
    navigation.goBack();
  };

  const handleDelete = () => {
    Alert.alert("Delete Habit?", "This action is permanent.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { deleteHabit(existing.id); navigation.navigate('Main'); } }
    ]);
  };

  const toggleDay = (d) => setTargetDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  return (
    <View style={styles.modalContainer}>
      <View style={styles.modalNavBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.navCancel}>Cancel</Text></TouchableOpacity>
        <Text style={styles.navTitle}>{isEditing ? "Edit Habit" : "New Habit"}</Text>
        <TouchableOpacity onPress={handleSave}><Text style={styles.navSave}>Save</Text></TouchableOpacity>
      </View>

      <ScrollView style={styles.formContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.formSection}>
          <Text style={styles.label}>NAME & DESCRIPTION</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="e.g. Drink Water" placeholderTextColor="#94A3B8" />
          <TextInput style={[styles.input, { marginTop: 10 }]} value={description} onChangeText={setDescription} placeholder="Add a motivation..." placeholderTextColor="#94A3B8" />
        </View>

        <Text style={styles.label}>FREQUENCY</Text>
        <View style={styles.pillRow}>
          {['daily', 'weekly', 'custom'].map(f => (
            <TouchableOpacity key={f} onPress={() => setFrequency(f)} style={[styles.pill, frequency === f && { backgroundColor: COLORS.primary }]}>
              <Text style={[styles.pillText, frequency === f && { color: 'white' }]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {frequency === 'custom' && (
          <View style={styles.dayRow}>
            {WEEKDAYS.map(d => (
              <TouchableOpacity key={d.key} onPress={() => toggleDay(d.key)} style={[styles.dayBtn, targetDays.includes(d.key) && { backgroundColor: COLORS.primary }]}>
                <Text style={[styles.dayText, targetDays.includes(d.key) && { color: 'white' }]}>{d.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={styles.label}>APPEARANCE</Text>
        <View style={styles.colorGrid}>
          {['#4F46E5', '#EC4899', '#EF4444', '#F59E0B', '#10B981', '#06B6D4'].map(c => (
            <TouchableOpacity key={c} onPress={() => setColor(c)} style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorActive]} />
          ))}
        </View>
        <View style={styles.iconGrid}>
          {AVAILABLE_ICONS.map(icon => (
            <TouchableOpacity key={icon} onPress={() => setSelectedIcon(icon)} style={[styles.iconOption, selectedIcon === icon && { backgroundColor: color, borderColor: color }]}>
              <Ionicons name={icon} size={20} color={selectedIcon === icon ? 'white' : COLORS.subText} />
            </TouchableOpacity>
          ))}
        </View>

        {isEditing && <TouchableOpacity style={styles.btnDelete} onPress={handleDelete}><Text style={styles.txtDelete}>Delete Habit</Text></TouchableOpacity>}
        <View style={{ height: 50 }} />
      </ScrollView>
    </View>
  );
};

const HabitDetailScreen = ({ route, navigation }) => {
  const { habitId } = route.params;
  const { habits } = useContext(HabitContext);
  const habit = habits.find(h => h.id === habitId);
  if (!habit) return null;

  const daysInMonth = moment().daysInMonth();
  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <ScrollView style={styles.detailContainer}>
      <View style={styles.detailHeader}>
        <View style={[styles.detailIconBig, { backgroundColor: habit.color }]}>
          <Ionicons name={habit.icon} size={40} color="white" />
        </View>
        <Text style={styles.detailTitleText}>{habit.title}</Text>
        <Text style={styles.detailDescText}>{habit.description || "No description"}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('AddHabit', { habit })} style={styles.btnEdit}>
          <Text style={styles.txtEdit}>Edit Details</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statGrid}>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: habit.color }]}>{habit.streak}</Text>
          <Text style={styles.statLabel}>Current Streak</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: habit.color }]}>{habit.longestStreak}</Text>
          <Text style={styles.statLabel}>Best Record</Text>
        </View>
      </View>

      <View style={styles.calendarBox}>
        <Text style={styles.boxTitle}>History ({moment().format('MMMM')})</Text>
        <View style={styles.calendarGrid}>
          {calendarDays.map(day => {
            const dateStr = moment().date(day).format('YYYY-MM-DD');
            const isDone = habit.completedDates.includes(dateStr);
            return (
              <View key={day} style={styles.calCell}>
                <View style={[styles.calDot, isDone ? { backgroundColor: habit.color } : { backgroundColor: '#F1F5F9' }]}>
                  <Text style={{ fontSize: 10, color: isDone ? 'white' : '#94A3B8' }}>{day}</Text>
                </View>
              </View>
            )
          })}
        </View>
      </View>
    </ScrollView>
  );
};

const AnalyticsScreen = () => {
  const { habits } = useContext(HabitContext);
  const labels = [], dataPoints = [];
  for (let i = 6; i >= 0; i--) {
    const d = moment().subtract(i, 'days');
    labels.push(d.format('dd'));
    const dateStr = d.format('YYYY-MM-DD');
    dataPoints.push(habits.reduce((acc, h) => acc + (h.completedDates.includes(dateStr) ? 1 : 0), 0));
  }
  const completionRate = habits.length > 0 ? Math.round((habits.filter(h => h.completedDates.includes(moment().format('YYYY-MM-DD'))).length / habits.length) * 100) : 0;
  const topHabit = [...habits].sort((a, b) => b.streak - a.streak)[0];

  return (
    <SafeAreaView style={styles.safeContainer}>
      <Text style={styles.screenTitle}>Analytics</Text>
      <ScrollView contentContainerStyle={{ padding: 20 }}>

        <View style={styles.widgetRow}>
          <View style={[styles.widgetCard, { backgroundColor: '#EEF2FF' }]}>
            <View style={[styles.widgetIcon, { backgroundColor: COLORS.primary }]}>
              <Ionicons name="pie-chart" size={20} color="white" />
            </View>
            <Text style={styles.widgetVal}>{completionRate}%</Text>
            <Text style={styles.widgetLbl}>Today's Rate</Text>
          </View>
          <View style={[styles.widgetCard, { backgroundColor: '#FDF2F8' }]}>
            <View style={[styles.widgetIcon, { backgroundColor: COLORS.accent1 }]}>
              <Ionicons name="trophy" size={20} color="white" />
            </View>
            <Text style={styles.widgetVal} numberOfLines={1}>{topHabit ? topHabit.streak : 0}</Text>
            <Text style={styles.widgetLbl}>Best Streak</Text>
          </View>
        </View>

        <View style={styles.chartCard}>
          <Text style={styles.boxTitle}>Weekly Consistency</Text>
          <LineChart
            data={{ labels, datasets: [{ data: dataPoints }] }}
            width={SCREEN_WIDTH - 70} height={180}
            chartConfig={{
              backgroundColor: 'white', backgroundGradientFrom: 'white', backgroundGradientTo: 'white',
              decimalPlaces: 0, color: (opacity = 1) => `rgba(79, 70, 229, ${opacity})`,
              labelColor: () => '#64748B', propsForDots: { r: "4", strokeWidth: "2", stroke: COLORS.primary }
            }}
            bezier style={{ marginTop: 15 }}
          />
        </View>

        <Text style={styles.sectionTitle}>Active Habits</Text>
        {habits.map((h, i) => (
          <View key={h.id} style={styles.rankItem}>
            <View style={styles.rankLeft}>
              <Text style={styles.rankIdx}>#{i + 1}</Text>
              <Text style={styles.rankTitle}>{h.title}</Text>
            </View>
            <Text style={[styles.rankStreak, { color: COLORS.primary }]}>{h.streak} days</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const SettingsScreen = () => {
  const { settings, updateSettings } = useContext(HabitContext);
  const [showTimePicker, setShowTimePicker] = useState(false);
  return (
    <SafeAreaView style={styles.safeContainer}>
      <Text style={styles.screenTitle}>Settings</Text>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {Platform.OS === 'android' && (
          <View style={styles.alertBox}>
            <Ionicons name="information-circle" size={20} color={COLORS.warningText} />
            <Text style={styles.alertText}>Notifications on Android (Expo Go) are restricted. Use a Build to test properly.</Text>
          </View>
        )}
        <View style={styles.settingSection}>
          <Text style={styles.settingHeader}>PREFERENCES</Text>
          <View style={styles.settingCell}>
            <Text style={styles.cellText}>Daily Reminders</Text>
            <Switch value={settings.isRemindersEnabled} onValueChange={(v) => updateSettings(settings.reminderTime, settings.customMessage, v)} trackColor={{ true: COLORS.primary }} />
          </View>
          {settings.isRemindersEnabled && (
            <>
              <TouchableOpacity style={styles.settingCell} onPress={() => setShowTimePicker(true)}>
                <Text style={styles.cellText}>Time</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.cellValue}>{moment(settings.reminderTime).format('h:mm A')}</Text>
                  <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                </View>
              </TouchableOpacity>
              <View style={styles.settingInputContainer}>
                <Text style={styles.inputLabel}>Motivational Message</Text>
                <TextInput style={styles.settingInput} value={settings.customMessage} onChangeText={(t) => updateSettings(settings.reminderTime, t, settings.isRemindersEnabled)} />
              </View>
            </>
          )}
        </View>
        <View style={styles.settingSection}>
          <Text style={styles.settingHeader}>ABOUT</Text>
          <View style={styles.settingCell}>
            <Text style={styles.cellText}>Version</Text>
            <Text style={styles.cellValue}>2.0.0 (Modern UI)</Text>
          </View>
        </View>
      </ScrollView>
      {showTimePicker && <DateTimePicker value={new Date(settings.reminderTime)} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(e, d) => { setShowTimePicker(false); if (d) updateSettings(d.getTime(), settings.customMessage, settings.isRemindersEnabled) }} />}
    </SafeAreaView>
  );
};

// ==============================================
// 4. NAVIGATION (REVERTED TO STANDARD)
// ==============================================
const Tab = createBottomTabNavigator();
const RootStack = createStackNavigator();

const MainTabs = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      // Standard Colors
      tabBarActiveTintColor: COLORS.primary,
      tabBarInactiveTintColor: '#94A3B8',
      // Standard Style (No Floating, No transparency pills)
      tabBarStyle: {
        backgroundColor: COLORS.surface,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
        height: Platform.OS === 'ios' ? 88 : 60,
        paddingTop: 5,
        paddingBottom: Platform.OS === 'ios' ? 25 : 5,
        elevation: 0,
      },
      tabBarLabelStyle: {
        fontSize: 11,
        fontWeight: '600',
        marginBottom: 3
      },
      // Standard Icons
      tabBarIcon: ({ focused, color, size }) => {
        let iconName;
        if (route.name === 'Home') iconName = focused ? 'grid' : 'grid-outline';
        else if (route.name === 'Analytics') iconName = focused ? 'pie-chart' : 'pie-chart-outline';
        else if (route.name === 'Settings') iconName = focused ? 'settings' : 'settings-outline';

        return <Ionicons name={iconName} size={size} color={color} />;
      },
    })}
  >
    <Tab.Screen name="Home" component={HomeScreen} />
    <Tab.Screen name="Analytics" component={AnalyticsScreen} />
    <Tab.Screen name="Settings" component={SettingsScreen} />
  </Tab.Navigator>
);

export default function App() {
  return (
    <HabitProvider>
      <NavigationContainer>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          <RootStack.Screen name="Main" component={MainTabs} />
          <RootStack.Screen name="AddHabit" component={AddEditHabitScreen} options={{ presentation: 'modal' }} />
          <RootStack.Screen name="HabitDetail" component={HabitDetailScreen} options={{ presentation: 'card', headerShown: true, title: '' }} />
        </RootStack.Navigator>
      </NavigationContainer>
    </HabitProvider>
  );
}

// ==============================================
// STYLES (Modern)
// ==============================================
const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: COLORS.background },

  // Header Home
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, marginTop: 20, marginBottom: 10 },
  greetingText: { fontSize: 28, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  dateText: { fontSize: 14, color: COLORS.subText, fontWeight: '600', marginTop: 4, textTransform: 'uppercase' },
  btnAdd: { width: 48, height: 48, borderRadius: 16, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },

  // Progress Banner
  progressBanner: { marginHorizontal: 24, marginBottom: 24, padding: 20, backgroundColor: COLORS.text, borderRadius: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressTitle: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  progressSubtitle: { color: '#94A3B8', fontSize: 13, marginTop: 4 },
  circularProgress: { width: 50, height: 50, borderRadius: 25, borderWidth: 4, borderColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  progressPercent: { color: 'white', fontSize: 12, fontWeight: 'bold' },

  // Habit Card (Modern)
  habitCard: { backgroundColor: 'white', borderRadius: 24, padding: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center', shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  habitCardCompleted: { backgroundColor: '#F1F5F9', opacity: 0.8 }, // Dimmed when done
  cardContent: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  iconBox: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  habitTextContainer: { flex: 1, marginLeft: 16 },
  habitTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  textCompleted: { textDecorationLine: 'line-through', color: '#94A3B8' },
  habitSubRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  habitFreq: { fontSize: 12, color: '#94A3B8', fontWeight: '500', marginRight: 8 },
  streakTag: { flexDirection: 'row', backgroundColor: '#FFFBEB', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, alignItems: 'center' },
  streakNum: { fontSize: 10, fontWeight: 'bold', color: '#B45309', marginLeft: 2 },

  // Checkbox
  checkboxContainer: { padding: 4 },
  checkedCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.success, justifyContent: 'center', alignItems: 'center' },
  uncheckedCircle: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#E2E8F0' },

  // Empty State
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyIconBg: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primarySoft, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  emptyDesc: { textAlign: 'center', color: COLORS.subText, paddingHorizontal: 40, marginTop: 8, lineHeight: 20 },

  // Add/Edit Modal
  modalContainer: { flex: 1, backgroundColor: 'white' },
  modalNavBar: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center', borderBottomWidth: 1, borderColor: '#F1F5F9' },
  navTitle: { fontSize: 16, fontWeight: '700' },
  navCancel: { fontSize: 16, color: COLORS.subText },
  navSave: { fontSize: 16, color: COLORS.primary, fontWeight: 'bold' },
  formContainer: { padding: 24 },
  label: { fontSize: 12, fontWeight: '700', color: '#94A3B8', marginBottom: 12, letterSpacing: 0.5 },
  input: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 16, fontSize: 16, color: COLORS.text },
  pillRow: { flexDirection: 'row', marginBottom: 24 },
  pill: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20, backgroundColor: '#F1F5F9', marginRight: 10 },
  pillText: { fontWeight: '600', color: '#64748B' },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  dayBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  dayText: { fontWeight: '600', color: '#64748B' },
  colorGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  colorDot: { width: 40, height: 40, borderRadius: 20 },
  colorActive: { borderWidth: 3, borderColor: 'white', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 30 },
  iconOption: { width: '14%', aspectRatio: 1, borderRadius: 12, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
  btnDelete: { backgroundColor: '#FEF2F2', padding: 16, borderRadius: 16, alignItems: 'center' },
  txtDelete: { color: COLORS.danger, fontWeight: 'bold' },

  // Detail Screen
  detailContainer: { flex: 1, backgroundColor: 'white' },
  detailHeader: { alignItems: 'center', paddingVertical: 40, backgroundColor: '#F8FAFC' },
  detailIconBig: { width: 80, height: 80, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 16, shadowColor: COLORS.primary, shadowOpacity: 0.2, shadowRadius: 10 },
  detailTitleText: { fontSize: 24, fontWeight: 'bold', color: COLORS.text },
  detailDescText: { color: COLORS.subText, marginTop: 8, marginBottom: 20 },
  btnEdit: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: 'white', borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0' },
  txtEdit: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  statGrid: { flexDirection: 'row', padding: 20, gap: 15 },
  statBox: { flex: 1, backgroundColor: 'white', padding: 20, borderRadius: 20, borderWidth: 1, borderColor: '#F1F5F9', alignItems: 'center' },
  statNum: { fontSize: 28, fontWeight: '800', marginBottom: 4 },
  statLabel: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
  calendarBox: { margin: 20, padding: 20, backgroundColor: 'white', borderRadius: 24, borderWidth: 1, borderColor: '#F1F5F9' },
  boxTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, marginBottom: 16 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  calCell: { width: '12%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center' },
  calDot: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },

  // Analytics
  screenTitle: { fontSize: 30, fontWeight: '800', color: COLORS.text, marginHorizontal: 24, marginTop: 10 },
  widgetRow: { flexDirection: 'row', gap: 15, marginBottom: 24 },
  widgetCard: { flex: 1, padding: 20, borderRadius: 24, justifyContent: 'center' },
  widgetIcon: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  widgetVal: { fontSize: 24, fontWeight: '800', color: COLORS.text },
  widgetLbl: { fontSize: 12, fontWeight: '600', color: COLORS.subText, marginTop: 4 },
  chartCard: { backgroundColor: 'white', borderRadius: 24, padding: 20, marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, marginBottom: 16 },
  rankItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: 'white', borderRadius: 16, marginBottom: 10 },
  rankLeft: { flexDirection: 'row', alignItems: 'center' },
  rankIdx: { fontSize: 14, fontWeight: '700', color: '#CBD5E1', width: 30 },
  rankTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  rankStreak: { fontWeight: '700' },

  // Settings
  alertBox: { flexDirection: 'row', padding: 16, backgroundColor: '#FEF3C7', borderRadius: 16, marginBottom: 24, alignItems: 'center' },
  alertText: { flex: 1, marginLeft: 10, color: '#92400E', fontSize: 13, lineHeight: 18 },
  settingSection: { marginBottom: 30 },
  settingHeader: { fontSize: 12, fontWeight: '700', color: '#94A3B8', marginBottom: 10, letterSpacing: 1 },
  settingCell: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: 'white', borderRadius: 16, marginBottom: 2 },
  cellText: { fontSize: 16, fontWeight: '500', color: COLORS.text },
  cellValue: { color: COLORS.primary, marginRight: 8, fontWeight: '600' },
  settingInputContainer: { padding: 16, backgroundColor: 'white', borderRadius: 16, marginTop: 10 },
  inputLabel: { fontSize: 12, fontWeight: '600', color: '#94A3B8', marginBottom: 8 },
  settingInput: { fontSize: 16, color: COLORS.text, borderBottomWidth: 1, borderColor: '#E2E8F0', paddingBottom: 8 },
});