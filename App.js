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
// CONFIG & CONSTANTS
// ==============================================
const COLORS = {
  primary: '#2D68FF', // Màu xanh hiện đại hơn
  secondary: '#6C63FF',
  background: '#F7F8FA', // Nền sáng nhẹ, sạch sẽ
  white: '#FFFFFF',
  text: '#1A1C29',
  subText: '#868A9A',
  gray: '#E2E4E8',
  lightGray: '#F0F2F5',
  danger: '#FF4757',
  success: '#2ED573',
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

// Setup Notification Handler (GIỮ NGUYÊN)
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
// CONTEXT & LOGIC (GIỮ NGUYÊN)
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
      if (habits.length === 0) return;

      const triggerDate = new Date(reminderTime);
      await Notifications.scheduleNotificationAsync({
        content: { title: "Habit Reminder", body: customMessage },
        trigger: { hour: triggerDate.getHours(), minute: triggerDate.getMinutes(), repeats: true },
      });

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
      targetDays: [],
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
// COMPONENTS (UI NÂNG CẤP)
// ==============================================
const HabitItem = ({ habit, onToggle, onPress }) => {
  const today = moment().format('YYYY-MM-DD');
  const isCompleted = habit.completedDates.includes(today);

  let freqText = habit.frequency === 'daily' ? 'Everyday' : 'Weekly';
  if (habit.frequency === 'custom' && habit.targetDays && habit.targetDays.length > 0) {
    freqText = habit.targetDays.join(', ');
  } else if (habit.frequency === 'custom') {
    freqText = 'Custom';
  }

  return (
    <TouchableOpacity style={styles.habitCard} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cardLeft}>
        {/* Icon container bo tròn mềm hơn và màu nền nhẹ hơn */}
        <View style={[styles.iconContainer, { backgroundColor: habit.color + '15' }]}>
          <Ionicons name={habit.icon} size={24} color={habit.color} />
        </View>

        <View style={styles.habitInfo}>
          <Text style={[styles.habitTitle, isCompleted && styles.habitTitleCompleted]} numberOfLines={1}>
            {habit.title}
          </Text>

          <View style={styles.metaRow}>
            <View style={styles.streakBadge}>
              <Ionicons name="flame" size={12} color="#FF9F43" />
              <Text style={styles.streakText}>{habit.streak} day streak</Text>
            </View>
            <View style={styles.dotSeparator} />
            <Text style={styles.habitSubText}>{freqText}</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity onPress={onToggle} style={styles.checkboxArea} activeOpacity={0.6}>
        {isCompleted ? (
          <View style={[styles.checkCircleCompleted, { backgroundColor: COLORS.success }]}>
            <Ionicons name="checkmark" size={20} color={COLORS.white} strokeWidth={3} />
          </View>
        ) : (
          <View style={[styles.circleOutline, { borderColor: COLORS.gray }]} />
        )}
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

// ==============================================
// SCREENS (UI NÂNG CẤP)
// ==============================================

const HomeScreen = ({ navigation }) => {
  const { habits, toggleHabitCompletion } = useContext(HabitContext);
  const today = moment().format('YYYY-MM-DD');
  const completedCount = habits.filter(h => h.completedDates.includes(today)).length;

  return (
    <SafeAreaView style={styles.safeContainer}>
      <View style={styles.headerContainer}>
        <View>
          <Text style={styles.greetingText}>Hello, Achiever!</Text>
          <Text style={styles.headerTitle}>My Habits</Text>
          <Text style={styles.summaryText}>You completed {completedCount}/{habits.length} habits today.</Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('AddHabit')}
        >
          <Ionicons name="add" size={30} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={habits}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 20, paddingTop: 10 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <HabitItem
            habit={item}
            onToggle={() => toggleHabitCompletion(item.id)}
            onPress={() => navigation.navigate('HabitDetail', { habitId: item.id })}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconBg}>
              <Ionicons name="rocket-outline" size={50} color={COLORS.primary} />
            </View>
            <Text style={styles.emptyTitle}>Start Your Journey</Text>
            <Text style={styles.emptyText}>Create your first habit to get started!</Text>
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
  const [targetDays, setTargetDays] = useState(existingHabit.targetDays || []);

  const handleSave = () => {
    if (!title.trim()) {
      Alert.alert("Missing Info", "Please enter a habit title.");
      return;
    }
    const habitData = { title, description, frequency, icon: selectedIcon, color, targetDays };
    if (isEditing) updateHabit(existingHabit.id, habitData);
    else addHabit(habitData);
    navigation.goBack();
  };

  const handleDelete = () => {
    Alert.alert("Delete Habit", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: () => {
          deleteHabit(existingHabit.id);
          navigation.navigate('Main');
        }
      }
    ]);
  };

  const toggleDay = (day) => {
    if (targetDays.includes(day)) setTargetDays(targetDays.filter(d => d !== day));
    else setTargetDays([...targetDays, day]);
  };

  return (
    <View style={styles.fullScreenContainer}>
      <View style={styles.modalHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.modalTitle}>{isEditing ? "Edit Habit" : "New Habit"}</Text>
        <TouchableOpacity onPress={handleSave} style={styles.headerBtn}>
          <Text style={styles.doneText}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.formSection}>
          <TextInput
            style={styles.mainInputTitle}
            value={title}
            onChangeText={setTitle}
            placeholder="Habit Name"
            placeholderTextColor="#C4C4C4"
          />
          <TextInput
            style={styles.mainInputDesc}
            value={description}
            onChangeText={setDescription}
            placeholder="Motivation / Description (Optional)"
            placeholderTextColor="#C4C4C4"
          />
        </View>

        <Text style={styles.sectionLabel}>FREQUENCY</Text>
        <View style={styles.freqContainer}>
          {['daily', 'weekly', 'custom'].map(freq => (
            <TouchableOpacity
              key={freq}
              style={[styles.freqOption, frequency === freq && { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]}
              onPress={() => setFrequency(freq)}
            >
              <Text style={[styles.freqText, frequency === freq && { color: COLORS.white }]}>
                {freq.charAt(0).toUpperCase() + freq.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

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
              style={[styles.iconItem, selectedIcon === icon && { backgroundColor: color + '20', borderColor: color, borderWidth: 1 }]}
              onPress={() => setSelectedIcon(icon)}
            >
              <Ionicons name={icon} size={22} color={selectedIcon === icon ? color : COLORS.subText} />
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>THEME COLOR</Text>
        <View style={styles.colorRow}>
          {['#2D68FF', '#FF9F43', '#FF4757', '#5F27CD', '#10AC84', '#FECA57'].map(c => (
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
          <View style={[styles.calCircle, isCompleted ? { backgroundColor: habit.color } : { backgroundColor: COLORS.lightGray }]}>
            <Text style={{ color: isCompleted ? 'white' : COLORS.subText, fontSize: 11, fontWeight: '600' }}>{i}</Text>
          </View>
        </View>
      );
    }
    return <View style={styles.calGrid}>{days}</View>;
  };

  return (
    <ScrollView style={[styles.container, { paddingTop: 10 }]}>
      <View style={styles.detailCard}>
        <View style={[styles.detailIconCircle, { backgroundColor: habit.color }]}>
          <Ionicons name={habit.icon} size={40} color={COLORS.white} />
        </View>
        <Text style={styles.detailTitle}>{habit.title}</Text>
        <Text style={styles.detailDesc}>{habit.description || "No description provided"}</Text>

        <TouchableOpacity style={styles.editBtn} onPress={() => navigation.navigate('AddHabit', { habit })}>
          <Ionicons name="create-outline" size={16} color={COLORS.white} style={{ marginRight: 6 }} />
          <Text style={styles.editBtnText}>Edit Habit</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statBox}>
          <Text style={[styles.statVal, { color: habit.color }]}>{habit.streak}</Text>
          <Text style={styles.statLabel}>Current Streak</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statVal, { color: habit.color }]}>{habit.longestStreak}</Text>
          <Text style={styles.statLabel}>Best Streak</Text>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.cardTitle}>{moment().format('MMMM YYYY')}</Text>
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
        <Text style={styles.sectionHeader}>PREFERENCES</Text>
        <View style={styles.settingGroup}>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Daily Reminders</Text>
              <Text style={styles.settingSub}>Get notified to complete habits</Text>
            </View>
            <Switch
              value={settings.isRemindersEnabled}
              onValueChange={(val) => updateSettings(settings.reminderTime, settings.customMessage, val)}
              trackColor={{ true: COLORS.success, false: COLORS.gray }}
            />
          </View>

          {settings.isRemindersEnabled && (
            <>
              <View style={styles.separator} />
              <TouchableOpacity style={styles.settingRow} onPress={() => setShowTimePicker(true)}>
                <Text style={styles.settingLabel}>Reminder Time</Text>
                <View style={styles.settingValueBg}>
                  <Text style={styles.settingValue}>{moment(settings.reminderTime).format('h:mm A')}</Text>
                </View>
              </TouchableOpacity>

              <View style={styles.separator} />
              <View style={[styles.settingRow, { flexDirection: 'column', alignItems: 'flex-start' }]}>
                <Text style={[styles.settingLabel, { marginBottom: 8 }]}>Motivation Message</Text>
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

        <Text style={styles.sectionHeader}>ABOUT</Text>
        <View style={styles.settingGroup}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Version</Text>
            <Text style={styles.settingValueNoColor}>1.0.0 (Beta)</Text>
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
      <Text style={styles.headerTitlePage}>Insights</Text>

      <ScrollView contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
        <View style={styles.overviewRow}>
          <View style={[styles.overviewCard, { backgroundColor: COLORS.primary }]}>
            <Ionicons name="trophy" size={24} color="rgba(255,255,255,0.8)" style={{ marginBottom: 8 }} />
            <Text style={styles.overviewValueLight}>{completionRate}%</Text>
            <Text style={styles.overviewLabelLight}>Completion Rate</Text>
          </View>
          <View style={styles.overviewCard}>
            <Ionicons name="list" size={24} color={COLORS.primary} style={{ marginBottom: 8 }} />
            <Text style={styles.overviewValue}>{habits.length}</Text>
            <Text style={styles.overviewLabel}>Active Habits</Text>
          </View>
        </View>

        <View style={styles.chartCard}>
          <Text style={styles.cardTitle}>Weekly Activity</Text>
          <LineChart
            data={{ labels, datasets: [{ data: dataPoints }] }}
            width={SCREEN_WIDTH - 70}
            height={200}
            withInnerLines={false}
            withOuterLines={false}
            chartConfig={{
              backgroundColor: COLORS.white,
              backgroundGradientFrom: COLORS.white,
              backgroundGradientTo: COLORS.white,
              decimalPlaces: 0,
              color: (opacity = 1) => COLORS.primary,
              labelColor: () => COLORS.subText,
              propsForDots: { r: "5", strokeWidth: "0", fill: COLORS.primary }
            }}
            style={{ marginTop: 15 }}
            bezier
          />
        </View>

        <Text style={styles.sectionHeader}>TOP STREAKS</Text>
        <View style={styles.settingGroup}>
          {topHabits.length > 0 ? topHabits.map((h, index) => (
            <View key={h.id}>
              <View style={styles.rankRow}>
                <View style={styles.rankLeft}>
                  <View style={[styles.rankBadge, { backgroundColor: index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : '#CD7F32' }]}>
                    <Text style={styles.rankNum}>{index + 1}</Text>
                  </View>
                  <Text style={styles.rankName}>{h.title}</Text>
                </View>
                <Text style={styles.rankValue}>{h.streak} days</Text>
              </View>
              {index < topHabits.length - 1 && <View style={styles.separator} />}
            </View>
          )) : (
            <Text style={{ padding: 20, color: COLORS.subText, textAlign: 'center' }}>Not enough data yet.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// ==============================================
// NAVIGATION (GIỮ NGUYÊN)
// ==============================================
const Tab = createBottomTabNavigator();
const RootStack = createStackNavigator();

const MainTabs = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: COLORS.primary,
      tabBarInactiveTintColor: '#999',
      tabBarStyle: {
        backgroundColor: COLORS.white,
        borderTopWidth: 0,
        elevation: 10, // Shadow for Android
        shadowColor: '#000', // Shadow for iOS
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        height: Platform.OS === 'ios' ? 88 : 65,
        paddingTop: 10,
        paddingBottom: Platform.OS === 'ios' ? 25 : 10
      },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
      tabBarIcon: ({ focused, color, size }) => {
        let iconName;
        if (route.name === 'Home') iconName = focused ? 'grid' : 'grid-outline';
        else if (route.name === 'Analytics') iconName = focused ? 'pie-chart' : 'pie-chart-outline';
        else if (route.name === 'Settings') iconName = focused ? 'options' : 'options-outline';
        return <Ionicons name={iconName} size={24} color={color} />;
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
// STYLES (MODERNIZED)
// ==============================================
const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, paddingHorizontal: 20 },
  fullScreenContainer: { flex: 1, backgroundColor: COLORS.background },

  // HEADER
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: 10,
    marginBottom: 20,
    paddingHorizontal: 24
  },
  greetingText: { fontSize: 14, color: COLORS.subText, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  headerTitle: { fontSize: 34, fontWeight: '800', color: COLORS.text, marginTop: 4 },
  headerTitlePage: { fontSize: 34, fontWeight: '800', color: COLORS.text, marginHorizontal: 24, marginVertical: 20 },
  summaryText: { fontSize: 14, color: COLORS.subText, marginTop: 4 },
  addButton: {
    backgroundColor: COLORS.primary,
    width: 50, height: 50, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: COLORS.primary, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 6
  },

  // EMPTY STATE
  emptyContainer: { alignItems: 'center', marginTop: 100 },
  emptyIconBg: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#E8F0FE', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  emptyText: { marginTop: 8, fontSize: 15, color: COLORS.subText, textAlign: 'center', width: '70%' },

  // HABIT CARD (NEW DESIGN)
  habitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    padding: 18,
    borderRadius: 24,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.02)'
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  iconContainer: { width: 52, height: 52, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  habitInfo: { flex: 1 },
  habitTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  habitTitleCompleted: { color: COLORS.subText, textDecorationLine: 'line-through' },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  streakBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF5E6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  streakText: { fontSize: 11, color: '#FF9F43', marginLeft: 3, fontWeight: '700' },
  habitSubText: { fontSize: 12, color: COLORS.subText, fontWeight: '500' },
  dotSeparator: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: COLORS.gray, marginHorizontal: 8 },

  checkboxArea: { paddingLeft: 10 },
  circleOutline: { width: 28, height: 28, borderRadius: 14, borderWidth: 2.5, backgroundColor: 'transparent' },
  checkCircleCompleted: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },

  // MODAL FORM
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, backgroundColor: COLORS.white, alignItems: 'center' },
  headerBtn: { padding: 5 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  cancelText: { fontSize: 16, color: COLORS.subText },
  doneText: { fontSize: 16, fontWeight: '700', color: COLORS.primary },

  formSection: { marginBottom: 25, marginTop: 10 },
  mainInputTitle: { fontSize: 24, fontWeight: '700', color: COLORS.text, marginBottom: 10, paddingHorizontal: 4 },
  mainInputDesc: { fontSize: 16, color: COLORS.text, paddingHorizontal: 4 },

  sectionLabel: { fontSize: 12, color: COLORS.subText, marginBottom: 12, marginTop: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },

  freqContainer: { flexDirection: 'row', marginBottom: 20 },
  freqOption: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 14, backgroundColor: COLORS.lightGray, marginRight: 12, borderWidth: 1, borderColor: 'transparent' },
  freqText: { fontWeight: '600', fontSize: 14, color: COLORS.text },

  dayPickerContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25 },
  dayCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.lightGray, justifyContent: 'center', alignItems: 'center' },
  dayText: { fontSize: 14, fontWeight: '600', color: COLORS.text },

  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 25 },
  iconItem: { width: 46, height: 46, justifyContent: 'center', alignItems: 'center', margin: 6, borderRadius: 14, backgroundColor: COLORS.lightGray },

  colorRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
  colorCircle: { width: 40, height: 40, borderRadius: 20 },
  colorSelected: { borderWidth: 4, borderColor: COLORS.white, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4 },

  deleteBtn: { backgroundColor: '#FFF0F0', padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 10, marginBottom: 30 },
  deleteText: { color: COLORS.danger, fontSize: 16, fontWeight: '700' },

  // DETAIL SCREEN
  detailCard: { backgroundColor: COLORS.white, borderRadius: 24, padding: 24, alignItems: 'center', marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  detailIconCircle: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 16, shadowColor: COLORS.primary, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  detailTitle: { fontSize: 26, fontWeight: '800', marginBottom: 8, color: COLORS.text },
  detailDesc: { fontSize: 15, color: COLORS.subText, textAlign: 'center', marginBottom: 20 },
  editBtn: { flexDirection: 'row', backgroundColor: COLORS.text, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, alignItems: 'center' },
  editBtnText: { color: COLORS.white, fontWeight: '600' },

  statsContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  statBox: { flex: 1, backgroundColor: COLORS.white, padding: 20, borderRadius: 20, alignItems: 'center', marginHorizontal: 6, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6 },
  statVal: { fontSize: 28, fontWeight: '800', marginBottom: 4 },
  statLabel: { fontSize: 12, color: COLORS.subText, fontWeight: '600' },

  sectionCard: { backgroundColor: COLORS.white, padding: 24, borderRadius: 24, marginBottom: 20 },
  cardTitle: { fontSize: 18, fontWeight: '700', marginBottom: 20, color: COLORS.text },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calDay: { width: '14.28%', alignItems: 'center', marginBottom: 12 },
  calCircle: { width: 32, height: 32, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

  // SETTINGS UI
  sectionHeader: { fontSize: 13, color: COLORS.subText, marginBottom: 12, marginLeft: 10, marginTop: 24, fontWeight: '700', letterSpacing: 0.5 },
  settingGroup: { backgroundColor: COLORS.white, borderRadius: 20, overflow: 'hidden', padding: 5 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  settingLabel: { fontSize: 16, fontWeight: '500', color: COLORS.text },
  settingSub: { fontSize: 12, color: COLORS.subText, marginTop: 2 },
  settingValueBg: { backgroundColor: COLORS.lightGray, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  settingValue: { fontSize: 14, fontWeight: '600', color: COLORS.primary },
  settingValueNoColor: { fontSize: 15, color: COLORS.subText, marginRight: 10 },
  settingInput: { width: '100%', fontSize: 16, backgroundColor: COLORS.lightGray, padding: 12, borderRadius: 12, marginTop: 5, color: COLORS.text },
  separator: { height: 1, backgroundColor: COLORS.lightGray, marginLeft: 16 },

  // ANALYTICS
  overviewRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  overviewCard: { width: '48%', backgroundColor: COLORS.white, padding: 20, borderRadius: 24, alignItems: 'flex-start', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8 },
  overviewValue: { fontSize: 32, fontWeight: '800', color: COLORS.text },
  overviewValueLight: { fontSize: 32, fontWeight: '800', color: COLORS.white },
  overviewLabel: { fontSize: 13, color: COLORS.subText, fontWeight: '600', marginTop: 4 },
  overviewLabelLight: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600', marginTop: 4 },

  chartCard: { backgroundColor: COLORS.white, padding: 20, borderRadius: 24, marginBottom: 24, alignItems: 'center' },

  rankRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 10 },
  rankLeft: { flexDirection: 'row', alignItems: 'center' },
  rankBadge: { width: 24, height: 24, borderRadius: 6, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  rankNum: { fontSize: 12, fontWeight: 'bold', color: COLORS.white },
  rankName: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  rankValue: { fontSize: 15, color: COLORS.primary, fontWeight: '700' },
});