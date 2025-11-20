import React, { useState, useEffect, useContext, createContext } from 'react';
import {
  StyleSheet, Text, View, FlatList, TouchableOpacity,
  TextInput, ScrollView, Alert, Platform, Switch, Modal, SafeAreaView, StatusBar
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
// CONFIG & CONSTANTS
// ==============================================
const COLORS = {
  primary: '#007AFF',
  secondary: '#5856D6',
  background: '#F2F2F7',
  white: '#FFFFFF',
  text: '#000000',
  gray: '#8E8E93',
  lightGray: '#E5E5EA',
  danger: '#FF3B30',
  success: '#34C759',
  warningBg: '#FFF4CE',
  warningText: '#665D28'
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
  { key: 'Mon', label: 'M' },
  { key: 'Tue', label: 'T' },
  { key: 'Wed', label: 'W' },
  { key: 'Thu', label: 'T' },
  { key: 'Fri', label: 'F' },
  { key: 'Sat', label: 'S' },
  { key: 'Sun', label: 'S' },
];

// Setup Notification Handler
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch (error) {
  console.log("Notification Handler Error:", error);
}

// ==============================================
// CONTEXT & LOGIC
// ==============================================
const HabitContext = createContext();

const HabitProvider = ({ children }) => {
  const [habits, setHabits] = useState([]);
  const [reminderTime, setReminderTime] = useState(new Date().setHours(7, 0, 0, 0));
  const [customMessage, setCustomMessage] = useState("It's time to build your habits!");
  const [isRemindersEnabled, setIsRemindersEnabled] = useState(true);

  useEffect(() => {
    loadData();
    safeSetupNotifications();
  }, []);

  useEffect(() => {
    saveData();
    if (isRemindersEnabled) safeScheduleNotifications();
    else safeCancelNotifications();
  }, [habits, reminderTime, customMessage, isRemindersEnabled]);

  // --- SAFE NOTIFICATION FUNCTIONS ---
  const safeSetupNotifications = async () => {
    try {
      if (Platform.OS === 'android' && !Device.isDevice) return;
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
    } catch (error) { console.log("Error setup notifications:", error); }
  };

  const safeScheduleNotifications = async () => {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();

      // UPDATED: Don't schedule if no habits exist (avoid annoying users on first launch)
      if (habits.length === 0) return;

      const triggerDate = new Date(reminderTime);

      // Daily Reminder
      await Notifications.scheduleNotificationAsync({
        content: { title: "Habit Reminder", body: customMessage },
        trigger: { hour: triggerDate.getHours(), minute: triggerDate.getMinutes(), repeats: true },
      });

      // Smart Reminder (FR-8)
      const today = moment().format('YYYY-MM-DD');
      const allCompleted = habits.length > 0 && habits.every(h => h.completedDates.includes(today));
      if (!allCompleted) {
        await Notifications.scheduleNotificationAsync({
          content: { title: "Check-in", body: "Don't forget to complete your habits before the day ends!" },
          trigger: { hour: 20, minute: 0, repeats: true },
          identifier: 'smart_reminder_8pm'
        });
      }
    } catch (error) { console.log("Error scheduling:", error); }
  };

  const safeCancelNotifications = async () => {
    try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch (error) { }
  };

  const safeCancelSpecificNotification = async (id) => {
    try { await Notifications.cancelScheduledNotificationAsync(id); } catch (error) { }
  }

  // --- DATA PERSISTENCE ---
  const loadData = async () => {
    try {
      const storedHabits = await AsyncStorage.getItem('habits');
      const storedSettings = await AsyncStorage.getItem('settings');
      if (storedHabits) setHabits(JSON.parse(storedHabits));
      if (storedSettings) {
        const s = JSON.parse(storedSettings);
        setReminderTime(s.time); setCustomMessage(s.message); setIsRemindersEnabled(s.enabled);
      }
    } catch (e) { console.error(e); }
  };

  const saveData = async () => {
    try {
      await AsyncStorage.setItem('habits', JSON.stringify(habits));
      await AsyncStorage.setItem('settings', JSON.stringify({ time: reminderTime, message: customMessage, enabled: isRemindersEnabled }));
    } catch (e) { console.error(e); }
  };

  const updateSettings = (time, message, enabled) => {
    setReminderTime(time); setCustomMessage(message); setIsRemindersEnabled(enabled);
  };

  const addHabit = (habit) => {
    const newHabit = {
      id: Date.now().toString(),
      completedDates: [],
      startDate: moment().format('YYYY-MM-DD'),
      color: COLORS.primary,
      streak: 0,
      longestStreak: 0,
      targetDays: [], // New field for custom days
      ...habit
    };
    setHabits([...habits, newHabit]);
  };

  const updateHabit = (id, updatedFields) => {
    setHabits(habits.map(h => h.id === id ? { ...h, ...updatedFields } : h));
  };

  const deleteHabit = (id) => {
    setHabits(habits.filter(h => h.id !== id));
  };

  const toggleHabitCompletion = async (id) => {
    const today = moment().format('YYYY-MM-DD');
    const updatedHabits = habits.map(habit => {
      if (habit.id !== id) return habit;

      const isCompleted = habit.completedDates.includes(today);
      let newDates = isCompleted
        ? habit.completedDates.filter(d => d !== today)
        : [...habit.completedDates, today];

      // Recalculate Streak
      const sortedDates = newDates.sort();
      let currentStreak = 0;
      let longestStreak = habit.longestStreak || 0;
      let checkDate = moment();

      if (!newDates.includes(checkDate.format('YYYY-MM-DD'))) {
        checkDate.subtract(1, 'days');
      }

      while (newDates.includes(checkDate.format('YYYY-MM-DD'))) {
        currentStreak++;
        checkDate.subtract(1, 'days');
      }
      if (currentStreak > longestStreak) longestStreak = currentStreak;

      return { ...habit, completedDates: newDates, streak: currentStreak, longestStreak };
    });

    setHabits(updatedHabits);
    const allNowCompleted = updatedHabits.every(h => h.completedDates.includes(today));
    if (allNowCompleted) await safeCancelSpecificNotification('smart_reminder_8pm');
  };

  return (
    <HabitContext.Provider value={{
      habits, addHabit, updateHabit, deleteHabit, toggleHabitCompletion,
      settings: { reminderTime, customMessage, isRemindersEnabled },
      updateSettings
    }}>
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

  // UPDATED: Display logic for frequency description
  let freqText = habit.frequency === 'daily' ? 'Everyday' : 'Weekly';
  if (habit.frequency === 'custom' && habit.targetDays && habit.targetDays.length > 0) {
    freqText = habit.targetDays.join(', ');
  } else if (habit.frequency === 'custom') {
    freqText = 'Custom';
  }

  return (
    <TouchableOpacity style={styles.habitCard} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.cardLeft}>
        <View style={[styles.iconContainer, { backgroundColor: habit.color + '15' }]}>
          <Ionicons name={habit.icon} size={26} color={habit.color} />
        </View>
        <View style={styles.habitInfo}>
          <Text style={styles.habitTitle} numberOfLines={1}>{habit.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
            <Text style={styles.habitSubText}>{freqText}</Text>
            <View style={styles.dotSeparator} />
            <View style={styles.streakContainer}>
              <Ionicons name="flame" size={12} color="#FF9500" />
              <Text style={styles.streakText}>{habit.streak}</Text>
            </View>
          </View>
        </View>
      </View>

      <TouchableOpacity onPress={onToggle} style={styles.checkboxArea}>
        {isCompleted ? (
          <Ionicons name="checkmark-circle" size={38} color={COLORS.success} />
        ) : (
          <View style={[styles.circleOutline, { borderColor: COLORS.lightGray }]} />
        )}
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

// ==============================================
// SCREENS
// ==============================================

const HomeScreen = ({ navigation }) => {
  const { habits, toggleHabitCompletion } = useContext(HabitContext);

  return (
    <SafeAreaView style={styles.safeContainer}>
      <View style={styles.headerContainer}>
        <View>
          <Text style={styles.headerDate}>{moment().format('dddd, MMMM D')}</Text>
          <Text style={styles.headerTitle}>My Habits</Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('AddHabit')}
        >
          <Ionicons name="add" size={28} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={habits}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 20 }}
        renderItem={({ item }) => (
          <HabitItem
            habit={item}
            onToggle={() => toggleHabitCompletion(item.id)}
            onPress={() => navigation.navigate('HabitDetail', { habitId: item.id })}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="leaf-outline" size={60} color={COLORS.gray} />
            <Text style={styles.emptyText}>No habits yet. Start your journey!</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const AddEditHabitScreen = ({ route, navigation }) => {
  const { addHabit, updateHabit, deleteHabit } = useContext(HabitContext);
  const isEditing = route.params?.habit;
  const existingHabit = route.params?.habit || {};

  const [title, setTitle] = useState(existingHabit.title || '');
  const [description, setDescription] = useState(existingHabit.description || '');
  const [frequency, setFrequency] = useState(existingHabit.frequency || 'daily');
  const [selectedIcon, setSelectedIcon] = useState(existingHabit.icon || 'fitness');
  const [color, setColor] = useState(existingHabit.color || COLORS.primary);
  // UPDATED: State for custom days
  const [targetDays, setTargetDays] = useState(existingHabit.targetDays || []);

  const handleSave = () => {
    if (!title.trim()) {
      Alert.alert("Missing Info", "Please enter a habit title.");
      return;
    }
    // UPDATED: Save targetDays
    const habitData = { title, description, frequency, icon: selectedIcon, color, targetDays };
    if (isEditing) updateHabit(existingHabit.id, habitData);
    else addHabit(habitData);
    navigation.goBack();
  };

  const handleDelete = () => {
    Alert.alert("Delete Habit", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: () => {
          deleteHabit(existingHabit.id);
          // UPDATED: Navigate to Main instead of goBack to avoid stale screen
          navigation.navigate('Main');
        }
      }
    ]);
  };

  // UPDATED: Function to toggle days for custom frequency
  const toggleDay = (day) => {
    if (targetDays.includes(day)) {
      setTargetDays(targetDays.filter(d => d !== day));
    } else {
      setTargetDays([...targetDays, day]);
    }
  };

  return (
    <View style={styles.fullScreenContainer}>
      <View style={styles.modalHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.modalTitle}>{isEditing ? "Edit Habit" : "New Habit"}</Text>
        <TouchableOpacity onPress={handleSave}>
          <Text style={styles.doneText}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.inputGroup}>
          <TextInput
            style={styles.mainInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Habit Title (e.g. Read 10 pages)"
            autoFocus={false}
          />
          <View style={styles.separator} />
          <TextInput
            style={styles.mainInput}
            value={description}
            onChangeText={setDescription}
            placeholder="Description (Optional)"
          />
        </View>

        <Text style={styles.sectionLabel}>FREQUENCY TARGET</Text>
        <View style={styles.selectionRow}>
          {['daily', 'weekly', 'custom'].map(freq => (
            <TouchableOpacity
              key={freq}
              style={[styles.freqOption, frequency === freq && { backgroundColor: COLORS.primary }]}
              onPress={() => setFrequency(freq)}
            >
              <Text style={[styles.freqText, frequency === freq && { color: COLORS.white }]}>
                {freq === 'custom' ? 'Custom' : freq.charAt(0).toUpperCase() + freq.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* UPDATED: Show Day Picker if Custom is selected */}
        {frequency === 'custom' && (
          <View style={styles.dayPickerContainer}>
            {WEEKDAYS.map((day) => {
              const isSelected = targetDays.includes(day.key);
              return (
                <TouchableOpacity
                  key={day.key}
                  style={[styles.dayCircle, isSelected && { backgroundColor: COLORS.primary }]}
                  onPress={() => toggleDay(day.key)}
                >
                  <Text style={[styles.dayText, isSelected && { color: COLORS.white }]}>{day.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        )}

        <Text style={styles.sectionLabel}>ICON</Text>
        <View style={styles.iconGrid}>
          {AVAILABLE_ICONS.map(icon => (
            <TouchableOpacity
              key={icon}
              style={[styles.iconItem, selectedIcon === icon && { backgroundColor: color }]}
              onPress={() => setSelectedIcon(icon)}
            >
              <Ionicons name={icon} size={24} color={selectedIcon === icon ? COLORS.white : COLORS.gray} />
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>THEME COLOR</Text>
        <View style={styles.colorRow}>
          {['#007AFF', '#FF9500', '#FF3B30', '#5856D6', '#34C759', '#FF2D55'].map(c => (
            <TouchableOpacity
              key={c}
              style={[styles.colorCircle, { backgroundColor: c }, color === c && styles.colorSelected]}
              onPress={() => setColor(c)}
            />
          ))}
        </View>

        {isEditing && (
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
            <Text style={styles.deleteText}>Delete Habit</Text>
          </TouchableOpacity>
        )}
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

  const renderCalendar = () => {
    const daysInMonth = moment().daysInMonth();
    const days = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = moment().date(i).format('YYYY-MM-DD');
      const isCompleted = habit.completedDates.includes(dateStr);
      days.push(
        <View key={i} style={styles.calDay}>
          <View style={[styles.calCircle, isCompleted ? { backgroundColor: habit.color } : { backgroundColor: '#E5E5EA' }]}>
            <Text style={{ color: isCompleted ? 'white' : '#8E8E93', fontSize: 12 }}>{i}</Text>
          </View>
        </View>
      );
    }
    return <View style={styles.calGrid}>{days}</View>;
  };

  return (
    <ScrollView style={[styles.container, { paddingTop: 20 }]}>
      <View style={styles.detailHeader}>
        <View style={[styles.detailIconCircle, { backgroundColor: habit.color }]}>
          <Ionicons name={habit.icon} size={40} color={COLORS.white} />
        </View>
        <Text style={styles.detailTitle}>{habit.title}</Text>
        <Text style={{ color: COLORS.gray }}>{habit.description}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('AddHabit', { habit })}>
          <Text style={styles.editLink}>Edit Habit</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Performance</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statVal}>{habit.streak}</Text>
            <Text style={styles.statLabel}>Current Streak</Text>
          </View>
          <View style={[styles.statItem, { borderLeftWidth: 1, borderLeftColor: '#eee' }]}>
            <Text style={styles.statVal}>{habit.longestStreak}</Text>
            <Text style={styles.statLabel}>Best Streak</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>History ({moment().format('MMMM')})</Text>
        {renderCalendar()}
      </View>
      <View style={{ height: 50 }} />
    </ScrollView>
  );
};

const SettingsScreen = () => {
  const { settings, updateSettings } = useContext(HabitContext);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const handleTimeChange = (event, selectedDate) => {
    setShowTimePicker(false);
    if (selectedDate) updateSettings(selectedDate.getTime(), settings.customMessage, settings.isRemindersEnabled);
  };

  return (
    <SafeAreaView style={styles.safeContainer}>
      <Text style={styles.headerTitlePage}>Settings</Text>

      <ScrollView contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 20 }}>
        {Platform.OS === 'android' && (
          <View style={styles.infoBox}>
            <Ionicons name="alert-circle" size={24} color={COLORS.warningText} style={{ marginRight: 10 }} />
            <Text style={styles.infoText}>
              Notifications might not appear on Android Expo Go (SDK 53+). For full support, please use a Development Build.
            </Text>
          </View>
        )}

        <Text style={styles.sectionHeader}>NOTIFICATIONS</Text>
        <View style={styles.settingGroup}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Enable Reminders</Text>
            <Switch
              value={settings.isRemindersEnabled}
              onValueChange={(val) => updateSettings(settings.reminderTime, settings.customMessage, val)}
              trackColor={{ true: COLORS.success }}
            />
          </View>

          {settings.isRemindersEnabled && (
            <>
              <View style={styles.separator} />
              <TouchableOpacity style={styles.settingRow} onPress={() => setShowTimePicker(true)}>
                <Text style={styles.settingLabel}>Time</Text>
                <View style={styles.settingValueContainer}>
                  <Text style={styles.settingValue}>{moment(settings.reminderTime).format('h:mm A')}</Text>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.gray} />
                </View>
              </TouchableOpacity>

              <View style={styles.separator} />
              <View style={[styles.settingRow, { flexDirection: 'column', alignItems: 'flex-start' }]}>
                <Text style={[styles.settingLabel, { marginBottom: 10 }]}>Motivational Message</Text>
                <TextInput
                  style={styles.settingInput}
                  value={settings.customMessage}
                  onChangeText={(text) => updateSettings(settings.reminderTime, text, settings.isRemindersEnabled)}
                  placeholder="Enter text..."
                />
              </View>
            </>
          )}
        </View>

        <Text style={styles.sectionHeader}>APP INFO</Text>
        <View style={styles.settingGroup}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Version</Text>
            <Text style={styles.settingValueNoColor}>1.0.0</Text>
          </View>
        </View>
      </ScrollView>

      {showTimePicker && (
        <DateTimePicker
          value={new Date(settings.reminderTime)}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleTimeChange}
        />
      )}
    </SafeAreaView>
  );
};

const AnalyticsScreen = () => {
  const { habits } = useContext(HabitContext);

  // --- ANALYTICS LOGIC ---
  const labels = [];
  const dataPoints = [];
  for (let i = 6; i >= 0; i--) {
    const d = moment().subtract(i, 'days');
    labels.push(d.format('dd'));
    const dateStr = d.format('YYYY-MM-DD');
    dataPoints.push(habits.reduce((acc, h) => acc + (h.completedDates.includes(dateStr) ? 1 : 0), 0));
  }

  const totalHabits = habits.length;
  const today = moment().format('YYYY-MM-DD');
  const completedToday = habits.filter(h => h.completedDates.includes(today)).length;
  const completionRate = totalHabits > 0 ? Math.round((completedToday / totalHabits) * 100) : 0;

  const topHabits = [...habits].sort((a, b) => b.streak - a.streak).slice(0, 3);

  return (
    <SafeAreaView style={styles.safeContainer}>
      <Text style={styles.headerTitlePage}>Analytics</Text>

      <ScrollView contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>

        <View style={styles.overviewContainer}>
          <View style={styles.overviewCard}>
            <Text style={styles.overviewValue}>{completionRate}%</Text>
            <Text style={styles.overviewLabel}>Today's Rate</Text>
          </View>
          <View style={styles.overviewCard}>
            <Text style={styles.overviewValue}>{habits.length}</Text>
            <Text style={styles.overviewLabel}>Active Habits</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Weekly Trends</Text>
          <LineChart
            data={{ labels, datasets: [{ data: dataPoints }] }}
            width={SCREEN_WIDTH - 60}
            height={200}
            chartConfig={{
              backgroundColor: COLORS.white,
              backgroundGradientFrom: COLORS.white,
              backgroundGradientTo: COLORS.white,
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(142, 142, 147, ${opacity})`,
              propsForDots: { r: "4", strokeWidth: "2", stroke: COLORS.primary }
            }}
            style={{ borderRadius: 16, marginTop: 10, alignSelf: 'center' }}
            bezier
          />
        </View>

        <Text style={styles.sectionHeader}>TOP PERFORMERS</Text>
        <View style={styles.settingGroup}>
          {topHabits.length > 0 ? topHabits.map((h, index) => (
            <View key={h.id}>
              <View style={styles.rankRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.rankNumber}>#{index + 1}</Text>
                  <Text style={styles.rankName}>{h.title}</Text>
                </View>
                <Text style={styles.rankValue}>{h.streak} days</Text>
              </View>
              {index < topHabits.length - 1 && <View style={styles.separator} />}
            </View>
          )) : (
            <Text style={{ padding: 15, color: COLORS.gray, fontStyle: 'italic' }}>No data yet</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// ==============================================
// NAVIGATION
// ==============================================
const Tab = createBottomTabNavigator();
const RootStack = createStackNavigator();

const MainTabs = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: COLORS.primary,
      tabBarInactiveTintColor: COLORS.gray,
      tabBarStyle: {
        backgroundColor: COLORS.white,
        borderTopWidth: 0,
        elevation: 0,
        height: Platform.OS === 'ios' ? 88 : 60,
        paddingTop: 10,
        paddingBottom: Platform.OS === 'ios' ? 25 : 10
      },
      tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      tabBarIcon: ({ focused, color, size }) => {
        let iconName;
        if (route.name === 'Home') iconName = focused ? 'list' : 'list-outline';
        else if (route.name === 'Analytics') iconName = focused ? 'stats-chart' : 'stats-chart-outline';
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
          <RootStack.Screen
            name="AddHabit"
            component={AddEditHabitScreen}
            options={{ presentation: 'modal' }}
          />
          <RootStack.Screen name="HabitDetail" component={HabitDetailScreen} options={{ presentation: 'card', headerShown: true, title: '' }} />
        </RootStack.Navigator>
      </NavigationContainer>
    </HabitProvider>
  );
}

// ==============================================
// STYLES
// ==============================================
const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, paddingHorizontal: 20 },
  fullScreenContainer: { flex: 1, backgroundColor: COLORS.background },

  // HEADER
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
    paddingHorizontal: 20
  },
  headerDate: { paddingTop: 20, fontSize: 13, color: COLORS.gray, textTransform: 'uppercase', fontWeight: '600' },
  headerTitle: { fontSize: 32, fontWeight: 'bold', color: COLORS.text },
  headerTitlePage: { fontSize: 32, fontWeight: 'bold', color: COLORS.text, marginHorizontal: 20, marginVertical: 15 },
  addButton: { backgroundColor: COLORS.primary, width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', shadowColor: COLORS.primary, shadowOpacity: 0.3, shadowRadius: 5, shadowOffset: { width: 0, height: 4 } },

  // EMPTY STATE
  emptyContainer: { alignItems: 'center', marginTop: 250 },
  emptyText: { marginTop: 10, fontSize: 16, color: COLORS.gray },

  // UPDATED: REDESIGNED HABIT CARD
  habitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 5
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  iconContainer: { width: 50, height: 50, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  habitInfo: { flex: 1 },
  habitTitle: { fontSize: 17, fontWeight: 'bold', color: COLORS.text, marginBottom: 4 },
  habitSubText: { fontSize: 12, color: COLORS.gray, fontWeight: '500' },
  dotSeparator: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: COLORS.gray, marginHorizontal: 6 },
  streakContainer: { flexDirection: 'row', alignItems: 'center' },
  streakText: { fontSize: 12, color: COLORS.gray, marginLeft: 3, fontWeight: '600' },

  checkboxArea: { padding: 5 },
  circleOutline: { width: 32, height: 32, borderRadius: 16, borderWidth: 2 },

  // MODAL
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: COLORS.white, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalTitle: { fontSize: 17, fontWeight: '600' },
  cancelText: { fontSize: 17, color: COLORS.primary },
  doneText: { fontSize: 17, fontWeight: 'bold', color: COLORS.primary },

  // FORM INPUTS
  inputGroup: { backgroundColor: COLORS.white, borderRadius: 12, paddingHorizontal: 16, marginTop: 20, marginBottom: 25 },
  mainInput: { paddingVertical: 16, fontSize: 16 },
  separator: { height: 1, backgroundColor: COLORS.lightGray },

  sectionLabel: { fontSize: 13, color: COLORS.gray, marginBottom: 8, marginLeft: 16, fontWeight: '600' },
  selectionRow: { flexDirection: 'row', marginBottom: 15, paddingHorizontal: 10 }, // Reduced margin for custom picker
  freqOption: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: COLORS.lightGray, marginRight: 10 },
  freqText: { fontWeight: '600', fontSize: 14, color: COLORS.gray },

  // UPDATED: CUSTOM DAY PICKER
  dayPickerContainer: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 25, paddingHorizontal: 16 },
  dayCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.lightGray, justifyContent: 'center', alignItems: 'center' },
  dayText: { fontSize: 14, fontWeight: '600', color: COLORS.gray },

  // ICON & COLOR
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 25, paddingHorizontal: 5 },
  iconItem: { width: '14.5%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', margin: '1%', borderRadius: 10, backgroundColor: COLORS.white },
  colorRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 30, paddingHorizontal: 10 },
  colorCircle: { width: 36, height: 36, borderRadius: 18 },
  colorSelected: { borderWidth: 3, borderColor: COLORS.background, transform: [{ scale: 1.1 }] },

  deleteBtn: { backgroundColor: COLORS.white, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10, marginBottom: 30 },
  deleteText: { color: COLORS.danger, fontSize: 16, fontWeight: '600' },

  // DETAIL SCREEN
  detailHeader: { alignItems: 'center', marginVertical: 20 },
  detailIconCircle: { width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  detailTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 5 },
  editLink: { color: COLORS.primary, marginTop: 10, fontWeight: '600', fontSize: 16 },
  card: { backgroundColor: COLORS.white, padding: 20, borderRadius: 16, marginBottom: 20 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 15 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 24, fontWeight: 'bold', color: COLORS.primary },
  statLabel: { fontSize: 12, color: COLORS.gray },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calDay: { width: '14.28%', alignItems: 'center', marginBottom: 10 },
  calCircle: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },

  // SETTINGS & ANALYTICS UI
  sectionHeader: { fontSize: 13, color: COLORS.gray, marginBottom: 8, marginLeft: 16, marginTop: 24, fontWeight: '600' },
  settingGroup: { backgroundColor: COLORS.white, borderRadius: 12, overflow: 'hidden' },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  settingLabel: { fontSize: 16, color: COLORS.text },
  settingValueContainer: { flexDirection: 'row', alignItems: 'center' },
  settingValue: { fontSize: 16, color: COLORS.gray, marginRight: 5 },
  settingValueNoColor: { fontSize: 16, color: COLORS.gray },
  settingInput: { width: '100%', fontSize: 16, color: COLORS.primary, marginTop: 5 },

  // INFO BOX
  infoBox: { backgroundColor: COLORS.warningBg, padding: 15, borderRadius: 12, marginBottom: 20, flexDirection: 'row', alignItems: 'flex-start' },
  infoText: { color: COLORS.warningText, flex: 1, fontSize: 14, lineHeight: 20 },

  // ANALYTICS CARDS
  overviewContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  overviewCard: { width: '48%', backgroundColor: COLORS.white, padding: 20, borderRadius: 16, alignItems: 'center' },
  overviewValue: { fontSize: 28, fontWeight: 'bold', color: COLORS.primary },
  overviewLabel: { fontSize: 13, color: COLORS.gray, marginTop: 5 },

  // TOP HABITS
  rankRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  rankNumber: { fontSize: 16, fontWeight: 'bold', color: COLORS.gray, marginRight: 10, width: 25 },
  rankName: { fontSize: 16, fontWeight: '500', color: COLORS.text },
  rankValue: { fontSize: 16, color: COLORS.primary, fontWeight: '600' },
});