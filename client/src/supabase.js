import { createClient } from '@supabase/supabase-js';

// Supabase credentials — hardcoded for Supabase-only architecture (no backend config fetch needed)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://lqbxpwpxopjqaoimlhmu.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxYnhwd3B4b3BqcWFvaW1saG11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMTcwNDQsImV4cCI6MjA5MjU5MzA0NH0.aGOQP5lsv9oAOBeB_tQTVVA3njlCI70z50jUQXTBgZk';

// Static client — always available (no dynamic fallback needed)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Paginated helper to fetch ALL records from a Supabase table (bypassing default 1000-row limit)
export async function fetchFullTable(tableName, orderColumn = 'id') {
    let allData = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
        const fromRange = page * pageSize;
        const toRange = fromRange + pageSize - 1;
        
        let query = supabase.from(tableName).select('*').range(fromRange, toRange);
        if (orderColumn) {
            query = query.order(orderColumn, { ascending: true });
        }
        
        const { data, error } = await query;
        if (error) {
            console.error(`[fetchFullTable] Error on page ${page} of ${tableName}:`, error.message);
            throw error;
        }

        if (data && data.length > 0) {
            allData = allData.concat(data);
            if (data.length < pageSize) {
                hasMore = false;
            } else {
                page++;
            }
        } else {
            hasMore = false;
        }
    }

    return allData;
}
