import { useState, useEffect } from 'react';
import { supabase, IpsomRate, MollsworthWorkRate } from '../lib/supabase';

export interface UseTimesheetDataReturn {
  ipsomRates: IpsomRate[];
  mollsworthRates: MollsworthWorkRate[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useTimesheetData = (): UseTimesheetDataReturn => {
  const [ipsomRates, setIpsomRates] = useState<IpsomRate[]>([]);
  const [mollsworthRates, setMollsworthRates] = useState<MollsworthWorkRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch Ipsom rates
      const { data: ipsomData, error: ipsomError } = await supabase
        .from('ipsom_rates')
        .select('*')
        .eq('is_active', true)
        .order('work_item');

      if (ipsomError) throw ipsomError;

      // Fetch Mollsworth rates
      const { data: mollsworthData, error: mollsworthError } = await supabase
        .from('mollsworth_work_rates')
        .select('*')
        .eq('is_active', true)
        .order('col1_work_item');

      if (mollsworthError) throw mollsworthError;

      setIpsomRates(ipsomData || []);
      setMollsworthRates(mollsworthData || []);
    } catch (err) {
      console.error('Error fetching timesheet data:', err);
      setError('Failed to load timesheet data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return {
    ipsomRates,
    mollsworthRates,
    loading,
    error,
    refetch: fetchData,
  };
};