import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = 'https://xboyefxywyhthczuqzpk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhib3llZnh5d3lodGhjenVxenBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMjkwODgsImV4cCI6MjA5NDcwNTA4OH0.TN16_kQtKBnZQlAp8cexL3TewdRVtG2KF68_MPIs2yo';


const customFetch = async (url, options) => {
    return Promise.race([
        window.fetch(url, options),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Network timeout.')), 8000))
    ]);
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        
        lock: async (name, options, callback) => {
            const cb = typeof options === 'function' ? options : callback;
            return await cb();
        }
    },
    global: {
        fetch: customFetch
    }
});
