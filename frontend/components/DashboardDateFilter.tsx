"use client";

import { useAuth } from "../contexts/AuthContext";
import DateFilter from "./DateFilter";

export default function DashboardDateFilter() {
  const { dateRange, setDateRange } = useAuth();

  return <DateFilter value={dateRange} onChange={setDateRange} />;
}
