require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

async function migrate() {
    const dataDir = path.join(__dirname, 'data');

    // 1. Migrate Offerings
    const offeringsPath = path.join(dataDir, 'offerings.json');
    if (fs.existsSync(offeringsPath)) {
        console.log('Migrating Offerings...');
        const offerings = JSON.parse(fs.readFileSync(offeringsPath, 'utf8'));
        console.log(`Migrating ${offerings.length} total offerings...`);
        
        // Clear old records first
        await supabase.from('course_offerings').delete().neq('course_code', 'FORCE_DELETE_ALL');

        // Batch upload (100 at a time)
        const batchSize = 100;
        for (let i = 0; i < offerings.length; i += batchSize) {
            const batch = offerings.slice(i, i + batchSize).map(e => ({
                course_code: e.course_code,
                title: e.title,
                units: e.units,
                section: e.section,
                schedule_raw: e.schedule_raw,
                room: e.room,
                instructor: e.instructor,
                open_slots: e.open_slots,
                last_updated: new Date().toISOString()
            }));

            const { error } = await supabase.from('course_offerings').insert(batch);
            if (error) console.error(`Error in offerings batch ${i}:`, error);
            else console.log(`Uploaded offerings ${i} to ${Math.min(i + batchSize, offerings.length)}`);
        }
    }

    // 2. Migrate Advisement
    const advisementPath = path.join(dataDir, 'kaizen_advisement.json');
    if (fs.existsSync(advisementPath)) {
        console.log('Migrating Advisement...');
        const advisement = JSON.parse(fs.readFileSync(advisementPath, 'utf8'));
        // Structure depends on how it was saved, assuming array of codes for now
        const codes = Array.isArray(advisement) ? advisement : (advisement.advisedSubjects || []);
        
        if (codes.length > 0) {
            await supabase.from('student_advisement').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            const { error } = await supabase.from('student_advisement').insert(
                codes.map(code => ({ subject_code: code }))
            );
            if (error) console.error('Error migrating advisement:', error);
            else console.log('Successfully migrated advisement.');
        }
    }

    // 3. Migrate Curriculum
    const curriculumPath = path.join(dataDir, 'kaizen_curriculum.json');
    if (fs.existsSync(curriculumPath)) {
        console.log('Migrating Curriculum...');
        const curriculum = JSON.parse(fs.readFileSync(curriculumPath, 'utf8'));
        const options = Array.isArray(curriculum) ? curriculum : (curriculum.electiveOptions || []);

        if (options.length > 0) {
            await supabase.from('elective_options').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            const { error } = await supabase.from('elective_options').insert(
                options.map(e => ({
                    subject_code: e.subject_code,
                    subject_title: e.subject_title,
                    units: e.units,
                    credited: e.credited
                }))
            );
            if (error) console.error('Error migrating curriculum:', error);
            else console.log('Successfully migrated curriculum.');
        }
    }

    console.log('Migration completed!');
}

migrate();
