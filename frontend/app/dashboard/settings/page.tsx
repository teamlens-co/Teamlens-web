"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { MapPin, Search, Check, AlertCircle, Building2, Save, Trash2, Tags, ChevronDown, Clock } from "lucide-react";

type LocationSearchResult = {
  id: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  provider: "google" | "openstreetmap" | "database";
};

export default function SettingsPage() {
  const { user, authHeaders, apiBase } = useAuth();

  // Office Location state
  const [officeLat, setOfficeLat] = useState("");
  const [officeLng, setOfficeLng] = useState("");
  const [officeRadius, setOfficeRadius] = useState("200");
  const [officeLabel, setOfficeLabel] = useState("Main Office");
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [locationSuccess, setLocationSuccess] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [existingLocationId, setExistingLocationId] = useState<string | null>(null);
  const [officeLocationOpen, setOfficeLocationOpen] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<LocationSearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState("");

  // Threshold state
  const [thresholdMinutes, setThresholdMinutes] = useState("180");
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [settingsError, setSettingsError] = useState("");

  // Fetch existing office location and settings on load
  useEffect(() => {
    if (!authHeaders || user?.role !== "MANAGER") return;

    fetch(`${apiBase}/api/web/locations`, { headers: authHeaders, credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data && data.data.length > 0) {
          const loc = data.data[0];
          setOfficeLat(String(loc.latitude));
          setOfficeLng(String(loc.longitude));
          setOfficeRadius(String(loc.radiusMeters));
          setOfficeLabel(loc.label || "Main Office");
          setExistingLocationId(loc.id);
        }
      })
      .catch((err) => console.error("Failed to load office location", err));

    fetch(`${apiBase}/api/web/settings`, { headers: authHeaders, credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setThresholdMinutes(String(data.data.productivityThresholdMinutes || 180));
        }
      })
      .catch((err) => console.error("Failed to load settings", err));
  }, [authHeaders, apiBase, user]);

  // Debounced address search
  useEffect(() => {
    if (!authHeaders) return;

    if (!searchQuery.trim() || searchQuery.trim().length < 3) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      setHasSearched(false);
      try {
        const res = await fetch(`${apiBase}/api/web/locations/search?q=${encodeURIComponent(searchQuery)}`, {
          headers: authHeaders,
          credentials: "include",
        });
        const data = await res.json();
        setSearchResults(data.success && Array.isArray(data.data) ? data.data : []);
      } catch (err) {
        console.error("Location search failed", err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
        setHasSearched(true);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [apiBase, authHeaders, searchQuery]);

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authHeaders) return;

    setLoadingLocation(true);
    setLocationError("");
    setLocationSuccess(false);

    try {
      const response = await fetch(`${apiBase}/api/web/locations`, {
        method: "PUT",
        headers: authHeaders,
        credentials: "include",
        body: JSON.stringify({
          label: officeLabel,
          latitude: parseFloat(officeLat),
          longitude: parseFloat(officeLng),
          radiusMeters: parseInt(officeRadius, 10),
        }),
      });
      const data = await response.json();
      if (data.success) {
        setLocationSuccess(true);
        if (data.data?.id) setExistingLocationId(data.data.id);
        setTimeout(() => setLocationSuccess(false), 3000);
      } else {
        setLocationError(data.message || "Failed to save location");
      }
    } catch {
      setLocationError("Network error occurred.");
    } finally {
      setLoadingLocation(false);
    }
  };

  const handleDeleteLocation = async () => {
    if (!authHeaders || !existingLocationId) return;
    if (!window.confirm("Are you sure you want to remove the office location? All future sessions will be marked as Remote.")) return;

    try {
      const res = await fetch(`${apiBase}/api/web/locations/${existingLocationId}`, {
        method: "DELETE",
        headers: authHeaders,
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setOfficeLat("");
        setOfficeLng("");
        setOfficeRadius("200");
        setOfficeLabel("Main Office");
        setExistingLocationId(null);
        setSelectedAddress("");
      }
    } catch (err) {
      console.error("Failed to delete location", err);
    }
  };

  const handleSaveSettings = async () => {
    if (!authHeaders) return;

    setLoadingSettings(true);
    setSettingsError("");
    setSettingsSuccess(false);

    try {
      const response = await fetch(`${apiBase}/api/web/settings`, {
        method: "PUT",
        headers: authHeaders,
        credentials: "include",
        body: JSON.stringify({
          productivityThresholdMinutes: parseInt(thresholdMinutes, 10),
        }),
      });
      const data = await response.json();
      if (data.success) {
        setSettingsSuccess(true);
        setTimeout(() => setSettingsSuccess(false), 3000);
      } else {
        setSettingsError(data.message || "Failed to save settings");
      }
    } catch (err: unknown) {
      console.error("Save settings error:", err);
      const message = err instanceof Error ? err.message : "Network error occurred.";
      setSettingsError(`Error: ${message}`);
    } finally {
      setLoadingSettings(false);
    }
  };

  if (!user || user.role !== "MANAGER") {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center">
        <Building2 className="mb-4 h-10 w-10 text-muted-foreground" />
        <h2 className="text-[14px] font-semibold text-foreground">Access Restricted</h2>
        <p className="mt-1 text-[12px] text-muted-foreground">Only organization managers can access Settings.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-5">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">Manage your organization&apos;s configuration.</p>
      </div>

      <Link
        href="/dashboard/productivity-labels"
        className="flex items-center gap-3 rounded-xl border border-border bg-[var(--surface-2)] p-4 shadow-[0_1px_2px_rgba(45,42,38,0.04)] transition-colors hover:bg-accent/40"
      >
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--brand-tint)] text-primary">
          <Tags className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold text-foreground">Productivity Labels</span>
          <span className="block text-[12px] text-muted-foreground">Manage app and domain productivity classification rules.</span>
        </span>
      </Link>

      {/* Office Location Card */}
      <div className="overflow-hidden rounded-xl border border-border bg-[var(--surface-2)] shadow-[0_1px_2px_rgba(45,42,38,0.04)]">
        <button
          type="button"
          onClick={() => setOfficeLocationOpen((current) => !current)}
          className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
          aria-expanded={officeLocationOpen}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--brand-tint)] text-primary">
            <MapPin className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="block text-[13px] font-semibold text-foreground">Office Location</span>
              {existingLocationId ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[oklch(0.95_0.04_155)] px-2 py-0.5 text-[10.5px] font-medium text-[oklch(0.45_0.16_155)]">
                  <Check className="h-3 w-3" /> Configured
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
              {existingLocationId
                ? `${officeLabel} · ${officeRadius}m office radius`
                : "Set office geo-fencing for office and remote attendance."}
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${officeLocationOpen ? "rotate-180" : ""}`}
          />
        </button>

        {officeLocationOpen ? (
        <div className="space-y-5 border-t border-border bg-background/25 p-4">
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            Set the office coordinates so TeamLens can automatically classify employee sessions as <strong>Office</strong> or <strong>Remote</strong> based on their clock-in location.
          </p>

          {/* Current Location Display */}
          {existingLocationId && officeLat && officeLng && (
            <div className="group flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 transition-colors hover:bg-accent/40">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--brand-tint)] text-primary">
                <Building2 className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-medium text-foreground">{officeLabel}</p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  {selectedAddress || `${parseFloat(officeLat).toFixed(4)}°, ${parseFloat(officeLng).toFixed(4)}°`}
                  &nbsp;·&nbsp;{officeRadius}m radius
                </p>
              </div>
              <button
                onClick={handleDeleteLocation}
                className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-500"
                title="Remove office location"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Search Bar */}
          <div className="rounded-xl border border-border bg-background p-4">
            <label className="mb-2 block text-[11.5px] text-muted-foreground">
              {existingLocationId ? "Change Office Address" : "Search for Office Address"}
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Start typing to search an address..."
                className="h-9 w-full rounded-md border border-border bg-[var(--surface-2)] px-3 pl-9 text-[12.5px] outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />

              {/* Floating Dropdown */}
              {(searchResults.length > 0 || isSearching || (hasSearched && searchResults.length === 0)) && searchQuery.trim().length >= 3 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-60 overflow-y-auto rounded-xl border border-border bg-[var(--surface-2)] shadow-[0_10px_30px_rgba(45,42,38,0.10)] divide-y divide-border">
                  {isSearching ? (
                    <div className="flex items-center px-4 py-3 text-[12.5px] text-muted-foreground">
                      <div className="animate-spin h-4 w-4 border-2 border-brand border-t-transparent rounded-full mr-3" />
                      Searching...
                    </div>
                  ) : searchResults.length > 0 ? (
                    <ul>
                      {searchResults.map((result) => (
                        <li
                          key={`${result.provider}-${result.id}`}
                          className="group cursor-pointer px-4 py-3 text-[12.5px] text-foreground transition-colors hover:bg-accent/50"
                          onClick={() => {
                            setOfficeLat(String(result.latitude));
                            setOfficeLng(String(result.longitude));
                            setOfficeLabel(result.label || "Main Office");
                            setSelectedAddress(result.address);
                            setSearchResults([]);
                            setSearchQuery("");
                            setHasSearched(false);
                          }}
                        >
                          <span className="block font-medium transition-colors group-hover:text-primary">{result.label}</span>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">{result.address}</span>
                        </li>
                      ))}
                    </ul>
                  ) : hasSearched && searchResults.length === 0 ? (
                    <div className="border-l-[3px] border-amber-400 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-700">
                      No results found. Please check your spelling.
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {/* Manual Coordinate & Radius Form */}
          <form onSubmit={handleSaveLocation} className="space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11.5px] text-muted-foreground">Office Name</label>
                <input
                  type="text"
                  className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                  placeholder="Main Office"
                  value={officeLabel}
                  onChange={(e) => setOfficeLabel(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11.5px] text-muted-foreground">Latitude</label>
                <input
                  type="number"
                  step="any"
                  required
                  className="h-9 w-full rounded-md border border-border bg-background px-2.5 font-mono text-[12.5px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                  placeholder="e.g. 28.6315"
                  value={officeLat}
                  onChange={(e) => setOfficeLat(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11.5px] text-muted-foreground">Longitude</label>
                <input
                  type="number"
                  step="any"
                  required
                  className="h-9 w-full rounded-md border border-border bg-background px-2.5 font-mono text-[12.5px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                  placeholder="e.g. 77.2167"
                  value={officeLng}
                  onChange={(e) => setOfficeLng(e.target.value)}
                />
              </div>
            </div>

            <div className="max-w-xs">
              <label className="mb-1 block text-[11.5px] text-muted-foreground">Radius (meters)</label>
              <input
                type="number"
                min={50}
                max={100000}
                required
                className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] font-medium text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                value={officeRadius}
                onChange={(e) => setOfficeRadius(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Geo-fencing threshold for office classification.</p>
            </div>

            {/* Feedback Messages */}
            {locationError && (
              <div className="flex items-center rounded-xl border border-rose-100 bg-rose-50 p-3 text-[12.5px] font-medium text-rose-600">
                <AlertCircle className="w-4 h-4 mr-3 flex-shrink-0" />
                {locationError}
              </div>
            )}
            {locationSuccess && (
              <div className="flex items-center rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-[12.5px] font-medium text-emerald-600">
                <Check className="w-4 h-4 mr-3 flex-shrink-0" />
                Office location saved successfully!
              </div>
            )}

            <button
              type="submit"
              disabled={loadingLocation || !officeLat || !officeLng}
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-[12.5px] font-medium text-primary-foreground shadow-[0_1px_2px_rgba(45,42,38,0.08)] transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="w-4 h-4 mr-2" />
              {loadingLocation ? "Saving..." : existingLocationId ? "Update Configuration" : "Save Location"}
            </button>
          </form>
        </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between px-5 py-4">
          <span className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
              <Clock className="w-[18px] h-[18px]" />
            </div>
            <span>
              <h2 className="text-[14px] font-semibold text-foreground">Productivity & Attendance Threshold</h2>
              <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                Set minimum minutes an employee must work per day to mark attendance.
              </span>
            </span>
          </span>
        </div>
        <div className="space-y-5 border-t border-border bg-background/25 p-4">
          <div className="max-w-xs">
            <label className="mb-1 block text-[11.5px] text-muted-foreground">Threshold (minutes)</label>
            <input
              type="number"
              min={1}
              required
              className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] font-medium text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              value={thresholdMinutes}
              onChange={(e) => setThresholdMinutes(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">e.g. 180 = 3 hours.</p>
          </div>

          {settingsError && (
            <div className="flex items-center rounded-xl border border-rose-100 bg-rose-50 p-3 text-[12.5px] font-medium text-rose-600">
              <AlertCircle className="w-4 h-4 mr-3 flex-shrink-0" />
              {settingsError}
            </div>
          )}
          {settingsSuccess && (
            <div className="flex items-center rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-[12.5px] font-medium text-emerald-600">
              <Check className="w-4 h-4 mr-3 flex-shrink-0" />
              Settings saved successfully!
            </div>
          )}

          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={loadingSettings || !thresholdMinutes}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-[12.5px] font-medium text-primary-foreground shadow-[0_1px_2px_rgba(45,42,38,0.08)] transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="w-4 h-4 mr-2" />
            {loadingSettings ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
