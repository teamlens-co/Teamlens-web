import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { ApiError, api, type GeofenceMatch, type SessionTrack } from "@/services/api";
import { formatDistance, formatDuration, matchGeofence } from "@/tracking/geofence";
import { requestPedometerPermission } from "@/tracking/pedometer";
import {
  flushQueue,
  getCurrentPosition,
  requestLocationPermissions,
  startTracking,
  stopTracking,
} from "@/tracking/tracker";
import { theme } from "@/theme";

export function ClockScreen() {
  const { token, bootstrap, refresh, signOut } = useAuth();

  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [geofence, setGeofence] = useState<GeofenceMatch | null>(null);
  const [track, setTrack] = useState<SessionTrack | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const session = bootstrap?.activeSession ?? null;
  const offices = bootstrap?.officeLocations ?? [];
  const settings = bootstrap?.tracking;

  /** Reads a fix and evaluates it against the office geofences on-device. */
  const checkGeofence = useCallback(async () => {
    const position = await getCurrentPosition();
    if (!position) {
      setGeofence(null);
      return null;
    }
    const match = matchGeofence(
      offices,
      position.coords.latitude,
      position.coords.longitude,
    );
    setGeofence(match);
    return position;
  }, [offices]);

  const loadTrack = useCallback(async () => {
    if (!token || !session) {
      setTrack(null);
      return;
    }
    try {
      setTrack(await api.sessionTrack(token, session.id));
    } catch {
      // The trail is a nice-to-have; a failure here must not block clocking out.
    }
  }, [token, session]);

  useEffect(() => {
    void checkGeofence();
  }, [checkGeofence]);

  useEffect(() => {
    void loadTrack();
  }, [loadTrack]);

  // While a shift is running, push anything queued offline and re-read totals.
  useEffect(() => {
    if (!session) return;

    const interval = setInterval(() => {
      void flushQueue().then(loadTrack);
    }, 30000);

    return () => clearInterval(interval);
  }, [session, loadTrack]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refresh(), checkGeofence(), loadTrack()]);
    setRefreshing(false);
  };

  const onClockIn = async () => {
    if (!token || busy) return;
    setBusy(true);
    setNotice(null);

    try {
      const permissions = await requestLocationPermissions();
      if (!permissions.foreground) {
        Alert.alert("Location required", permissions.message);
        return;
      }
      if (permissions.message) setNotice(permissions.message);

      await requestPedometerPermission();

      const position = await checkGeofence();
      if (!position) {
        Alert.alert(
          "No location fix",
          "Move somewhere with a clearer view of the sky and try again.",
        );
        return;
      }

      const created = await api.clockIn(token, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy ?? undefined,
        locationSource: "gps",
      });

      if (settings?.trackLocationWhileClockedIn) {
        const mode = await startTracking({
          sessionId: created.id,
          clockInAt: created.clockInAt,
          pingIntervalSeconds: settings.locationPingIntervalSeconds,
        });
        if (mode === "foreground-only") {
          setNotice(
            "Tracking only while this screen is open — background tracking needs a development build, not Expo Go.",
          );
        }
      }

      await refresh();
    } catch (err) {
      // A blocked clock-in comes back as 403 with the nearest office attached,
      // so the message can say how far away they are rather than just "denied".
      if (err instanceof ApiError && err.status === 403) {
        Alert.alert("Outside your work location", err.message);
      } else {
        Alert.alert("Could not clock in", (err as Error).message);
      }
    } finally {
      setBusy(false);
    }
  };

  const onClockOut = async () => {
    if (!token || !session || busy) return;
    setBusy(true);

    try {
      // Flush first so the last leg of the route is not lost with the session.
      await flushQueue();

      // Take a final fix before tracking stops, so the shift has a clock-out
      // point on the map and not just a clock-in one.
      const position = await getCurrentPosition();
      await stopTracking();
      await api.clockOut(
        token,
        session.id,
        position
          ? {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            }
          : undefined,
      );
      setTrack(null);
      await refresh();
    } catch (err) {
      Alert.alert("Could not clock out", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const clockedIn = session !== null;
  const blocked =
    settings?.geofencePolicy === "block" &&
    geofence !== null &&
    geofence.hasOfficeSetup &&
    !geofence.inside;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>TeamLens</Text>
          <Text style={styles.muted}>
            {clockedIn ? "On shift" : "Not clocked in"}
          </Text>
        </View>
        <Pressable onPress={signOut} hitSlop={12}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      <GeofenceCard geofence={geofence} policy={settings?.geofencePolicy ?? "off"} />

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      {clockedIn ? (
        <View style={styles.statRow}>
          <Stat label="Distance" value={formatDistance(track?.distanceMeters ?? 0)} />
          <Stat label="Steps" value={String(track?.stepCount ?? 0)} />
          <Stat label="Stops" value={String(track?.stops.length ?? 0)} />
        </View>
      ) : null}

      <Pressable
        style={[
          styles.action,
          clockedIn ? styles.actionStop : styles.actionStart,
          (busy || (!clockedIn && blocked)) && styles.actionDisabled,
        ]}
        onPress={clockedIn ? onClockOut : onClockIn}
        disabled={busy || (!clockedIn && blocked)}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.actionLabel}>
            {clockedIn ? "Clock out" : "Clock in"}
          </Text>
        )}
      </Pressable>

      {clockedIn && session ? (
        <Text style={styles.since}>
          Since {new Date(session.clockInAt).toLocaleTimeString()}
        </Text>
      ) : null}

      {track && track.stops.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Stops today</Text>
          {track.stops.map((stop) => (
            <View key={stop.startedAt} style={styles.stopRow}>
              <View style={styles.flex}>
                <Text style={styles.stopLabel}>
                  {stop.officeLabel ?? "Unnamed location"}
                </Text>
                <Text style={styles.muted}>
                  {new Date(stop.startedAt).toLocaleTimeString()} –{" "}
                  {new Date(stop.endedAt).toLocaleTimeString()}
                </Text>
              </View>
              <Text style={styles.stopDuration}>
                {formatDuration(stop.durationSeconds)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function GeofenceCard({
  geofence,
  policy,
}: {
  geofence: GeofenceMatch | null;
  policy: "off" | "warn" | "block";
}) {
  if (!geofence) {
    return (
      <View style={[styles.card, styles.cardMuted]}>
        <Text style={styles.cardTitle}>Locating…</Text>
        <Text style={styles.muted}>Waiting for a GPS fix.</Text>
      </View>
    );
  }

  if (!geofence.hasOfficeSetup) {
    return (
      <View style={[styles.card, styles.cardMuted]}>
        <Text style={styles.cardTitle}>No work locations set</Text>
        <Text style={styles.muted}>
          Your admin has not added any office locations, so clock-in is not
          restricted.
        </Text>
      </View>
    );
  }

  if (geofence.inside) {
    return (
      <View style={[styles.card, styles.cardSuccess]}>
        <Text style={styles.cardTitle}>At {geofence.officeLabel}</Text>
        <Text style={styles.muted}>
          {formatDistance(geofence.distanceMeters)} from the centre — you can
          clock in.
        </Text>
      </View>
    );
  }

  const blocking = policy === "block";
  return (
    <View style={[styles.card, blocking ? styles.cardDanger : styles.cardWarning]}>
      <Text style={styles.cardTitle}>
        {formatDistance(geofence.distanceMeters)} from {geofence.officeLabel}
      </Text>
      <Text style={styles.muted}>
        {blocking
          ? `Move within ${geofence.radiusMeters} m of the office to clock in.`
          : "You can clock in, but this shift will be flagged as off-site."}
      </Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: theme.color.bg },
  content: { padding: theme.space(5), gap: theme.space(4) },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: theme.space(8),
  },
  greeting: { fontSize: 26, fontWeight: "700", color: theme.color.text },
  muted: { fontSize: 14, color: theme.color.muted },
  signOut: { fontSize: 14, color: theme.color.primary, fontWeight: "600" },
  notice: {
    fontSize: 13,
    color: theme.color.warning,
    backgroundColor: theme.color.warningBg,
    padding: theme.space(3),
    borderRadius: theme.radius.sm,
  },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
    padding: theme.space(4),
    gap: theme.space(1),
  },
  cardMuted: { backgroundColor: theme.color.surface },
  cardSuccess: { backgroundColor: theme.color.successBg, borderColor: "#a7f3d0" },
  cardWarning: { backgroundColor: theme.color.warningBg, borderColor: "#fde68a" },
  cardDanger: { backgroundColor: theme.color.dangerBg, borderColor: "#fecaca" },
  cardTitle: { fontSize: 16, fontWeight: "700", color: theme.color.text },
  statRow: { flexDirection: "row", gap: theme.space(3) },
  stat: {
    flex: 1,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    padding: theme.space(4),
    alignItems: "center",
    gap: theme.space(1),
  },
  statValue: { fontSize: 20, fontWeight: "700", color: theme.color.text },
  statLabel: { fontSize: 12, color: theme.color.muted },
  action: {
    borderRadius: theme.radius.lg,
    paddingVertical: theme.space(5),
    alignItems: "center",
  },
  actionStart: { backgroundColor: theme.color.primary },
  actionStop: { backgroundColor: theme.color.danger },
  actionDisabled: { opacity: 0.45 },
  actionLabel: { color: "#fff", fontSize: 18, fontWeight: "700" },
  since: { textAlign: "center", fontSize: 13, color: theme.color.muted },
  stopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space(3),
    paddingVertical: theme.space(2),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.color.border,
  },
  stopLabel: { fontSize: 15, fontWeight: "600", color: theme.color.text },
  stopDuration: { fontSize: 14, fontWeight: "600", color: theme.color.primary },
});
