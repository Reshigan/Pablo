# Mobile Development Patterns — Comprehensive Knowledge Base

## 1. React Native

### Project Structure
```
mobile-app/
├── src/
│   ├── screens/           # Screen components
│   │   ├── HomeScreen.tsx
│   │   ├── LoginScreen.tsx
│   │   └── ProfileScreen.tsx
│   ├── components/        # Reusable components
│   ├── navigation/        # React Navigation config
│   │   └── AppNavigator.tsx
│   ├── services/          # API clients
│   ├── stores/            # State management
│   ├── hooks/             # Custom hooks
│   └── utils/             # Helpers
├── ios/
├── android/
├── app.json
└── package.json
```

### Navigation (React Navigation)
```typescript
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
    return (
        <Tab.Navigator>
            <Tab.Screen name="Home" component={HomeScreen} />
            <Tab.Screen name="Orders" component={OrdersScreen} />
            <Tab.Screen name="Profile" component={ProfileScreen} />
        </Tab.Navigator>
    );
}

function App() {
    return (
        <NavigationContainer>
            <Stack.Navigator>
                <Stack.Screen name="Login" component={LoginScreen} />
                <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
                <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
            </Stack.Navigator>
        </NavigationContainer>
    );
}
```

### Offline-First Architecture
```typescript
// AsyncStorage for local data
import AsyncStorage from '@react-native-async-storage/async-storage';

// Queue actions when offline
class OfflineQueue {
    async enqueue(action: { type: string; payload: any; endpoint: string }) {
        const queue = JSON.parse(await AsyncStorage.getItem('offlineQueue') || '[]');
        queue.push({ ...action, timestamp: Date.now() });
        await AsyncStorage.setItem('offlineQueue', JSON.stringify(queue));
    }
    
    async processQueue() {
        const queue = JSON.parse(await AsyncStorage.getItem('offlineQueue') || '[]');
        for (const action of queue) {
            try {
                await api.post(action.endpoint, action.payload);
                queue.shift();
                await AsyncStorage.setItem('offlineQueue', JSON.stringify(queue));
            } catch {
                break; // Stop on first failure, retry later
            }
        }
    }
}
```

### Camera & Image Capture
```typescript
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';

const takePhoto = async () => {
    const result = await launchCamera({
        mediaType: 'photo',
        quality: 0.8,
        maxWidth: 1920,
        maxHeight: 1080,
        includeBase64: false,
    });
    
    if (!result.didCancel && result.assets?.[0]) {
        const asset = result.assets[0];
        // Upload to server
        const formData = new FormData();
        formData.append('photo', {
            uri: asset.uri,
            type: asset.type,
            name: asset.fileName,
        });
        await api.post('/api/photos', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    }
};
```

### GPS / Location Services
```typescript
import Geolocation from '@react-native-community/geolocation';

const getCurrentLocation = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
        Geolocation.getCurrentPosition(
            (position) => resolve({
                lat: position.coords.latitude,
                lng: position.coords.longitude,
            }),
            (error) => reject(error),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
        );
    });
};

// Background location tracking
import BackgroundGeolocation from 'react-native-background-geolocation';

BackgroundGeolocation.ready({
    desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
    distanceFilter: 10, // meters
    stopOnTerminate: false,
    startOnBoot: true,
}).then(() => BackgroundGeolocation.start());
```

### Push Notifications
```typescript
import messaging from '@react-native-firebase/messaging';

// Request permission
const authStatus = await messaging().requestPermission();

// Get FCM token
const token = await messaging().getToken();
// Send token to your server

// Handle foreground messages
messaging().onMessage(async (remoteMessage) => {
    // Show local notification
});

// Handle background messages
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    // Process silently
});
```

### Barcode/QR Scanning
```typescript
import { RNCamera } from 'react-native-camera';

<RNCamera
    style={{ flex: 1 }}
    onBarCodeRead={({ data, type }) => {
        console.log(`Scanned ${type}: ${data}`);
        // Process barcode data
    }}
    barCodeTypes={[RNCamera.Constants.BarCodeType.qr, RNCamera.Constants.BarCodeType.ean13]}
/>
```

## 2. Progressive Web App (PWA)

### Service Worker Registration
```typescript
// In main.tsx or index.tsx
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js');
    });
}
```

### Manifest
```json
{
    "name": "My Sales App",
    "short_name": "SalesApp",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#0D0F12",
    "theme_color": "#F5B800",
    "icons": [
        { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
        { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
    ]
}
```

### Offline Caching Strategy
```javascript
// Cache-first for static assets
self.addEventListener('fetch', (event) => {
    if (event.request.destination === 'image' || 
        event.request.url.includes('/assets/')) {
        event.respondWith(
            caches.match(event.request).then(cached => cached || fetch(event.request))
        );
    }
    
    // Network-first for API
    if (event.request.url.includes('/api/')) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const clone = response.clone();
                    caches.open('api-cache').then(cache => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
    }
});
```

## 3. Responsive Design

### Mobile-First Breakpoints
```css
/* Mobile first (default styles) */
.container { padding: 1rem; }

/* Tablet */
@media (min-width: 768px) {
    .container { padding: 2rem; max-width: 768px; }
}

/* Desktop */
@media (min-width: 1024px) {
    .container { padding: 3rem; max-width: 1200px; }
}
```

### Touch-Friendly UI
```css
/* Minimum touch target: 44x44px (Apple HIG) / 48x48dp (Material Design) */
.touch-target {
    min-height: 44px;
    min-width: 44px;
    padding: 12px;
}

/* Prevent text selection on interactive elements */
.no-select {
    -webkit-user-select: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
}
```

## 4. App Store / Distribution

### Android APK Build
```bash
# React Native
cd android && ./gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/app-release.apk

# Capacitor
npx cap build android
```

### iOS Build
```bash
# Requires macOS with Xcode
npx react-native run-ios --configuration Release
# Or use EAS Build (Expo) for cloud builds
eas build --platform ios
```

### OTA Updates (CodePush / EAS Update)
```bash
# Expo EAS Update
eas update --branch production --message "Bug fix for login"

# Users receive update on next app launch
```
