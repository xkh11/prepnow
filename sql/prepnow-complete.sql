-- ============================================================================
-- PrepNow - COMPLETE Supabase Database Setup
-- ============================================================================
-- Single master file containing EVERYTHING:
--   * 11 tables (10 original + training_resources)
--   * Auth trigger (auto-create users row on signup)
--   * Row-Level Security (RLS) on all tables
--   * is_admin() helper function
--   * RLS policies (user + admin role)
--   * RPC functions for question fetching and assessment saving
--   * Seed data: 23 skills, 180 questions, 70+ training resources
--
-- Safe to run on a fresh project. NOT idempotent for re-runs (drops everything).
-- Paste this entire file into Supabase SQL Editor and run.
-- ============================================================================


-- ============================================================================
-- 1. DROP EVERYTHING (CASCADE handles foreign keys)
-- ============================================================================
DROP TABLE IF EXISTS training_items        CASCADE;
DROP TABLE IF EXISTS training_plans        CASCADE;
DROP TABLE IF EXISTS training_resources    CASCADE;
DROP TABLE IF EXISTS interview_attempts    CASCADE;
DROP TABLE IF EXISTS assessment_skills     CASCADE;
DROP TABLE IF EXISTS assessments           CASCADE;
DROP TABLE IF EXISTS login_history         CASCADE;
DROP TABLE IF EXISTS student_profile       CASCADE;
DROP TABLE IF EXISTS questions             CASCADE;
DROP TABLE IF EXISTS skills                CASCADE;
DROP TABLE IF EXISTS users                 CASCADE;

DROP FUNCTION IF EXISTS public.handle_new_user()                                  CASCADE;
DROP FUNCTION IF EXISTS public.is_admin()                                         CASCADE;
DROP FUNCTION IF EXISTS public.get_random_questions(TEXT, TEXT, INT)              CASCADE;
DROP FUNCTION IF EXISTS public.get_random_interview_questions(TEXT, INT)          CASCADE;
DROP FUNCTION IF EXISTS public.save_assessment(UUID, TEXT, FLOAT, TEXT)           CASCADE;
DROP FUNCTION IF EXISTS public.save_assessment_with_skills(UUID, TEXT, FLOAT, TEXT, JSONB) CASCADE;


-- ============================================================================
-- 2. TABLES
-- ============================================================================

-- Users (mirrors auth.users 1:1; PK = auth.uid())
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  full_name     TEXT NOT NULL,
  role          TEXT DEFAULT 'student',
  target_role   TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Questions (assessment + interview)
CREATE TABLE questions (
  id              TEXT PRIMARY KEY,
  text            TEXT NOT NULL,
  options         JSONB,
  correct_index   INTEGER,
  skill           TEXT,
  difficulty      TEXT DEFAULT 'medium',
  question_type   TEXT NOT NULL CHECK (question_type IN ('assessment','interview')),
  category        TEXT NOT NULL,
  expected_points TEXT,
  active          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Skills master list
CREATE TABLE skills (
  skill_id    SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('technical','soft')),
  description TEXT
);

-- Student profile (extra info beyond auth)
CREATE TABLE student_profile (
  student_id      SERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  university      TEXT,
  college         TEXT,
  major           TEXT,
  gpa             FLOAT,
  graduation_year INTEGER
);

-- Login history
CREATE TABLE login_history (
  login_id    SERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  login_time  TIMESTAMPTZ DEFAULT now(),
  ip_address  TEXT,
  status      TEXT
);

-- Assessments
CREATE TABLE assessments (
  assessment_id  SERIAL PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type           TEXT CHECK (type IN ('skill','personal')),
  total_score    FLOAT,
  summary        TEXT,
  completed_at   TIMESTAMPTZ DEFAULT now()
);

-- Per-skill breakdown for each assessment
CREATE TABLE assessment_skills (
  assessment_id  INTEGER NOT NULL REFERENCES assessments(assessment_id) ON DELETE CASCADE,
  skill_id       INTEGER NOT NULL REFERENCES skills(skill_id)           ON DELETE CASCADE,
  skill_score    FLOAT,
  PRIMARY KEY (assessment_id, skill_id)
);

-- Interview attempts (one row per question answered)
CREATE TABLE interview_attempts (
  attempt_id  SERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  transcript  TEXT,
  ai_feedback TEXT,
  score       FLOAT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Training plans
CREATE TABLE training_plans (
  plan_id           SERIAL PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_title        TEXT,
  focus_area        TEXT,
  date_generated_at DATE DEFAULT CURRENT_DATE
);

-- Training items (per-plan resource list)
CREATE TABLE training_items (
  item_id      SERIAL PRIMARY KEY,
  plan_id      INTEGER NOT NULL REFERENCES training_plans(plan_id) ON DELETE CASCADE,
  skill_id     INTEGER REFERENCES skills(skill_id) ON DELETE SET NULL,
  platform     TEXT,
  course_name  TEXT,
  course_link  TEXT
);

-- Training resources master list (catalog of available courses/videos per skill)
CREATE TABLE training_resources (
  resource_id     SERIAL PRIMARY KEY,
  skill_name      TEXT NOT NULL,
  skill_category  TEXT NOT NULL CHECK (skill_category IN ('technical','soft','general')),
  resource_name   TEXT NOT NULL,
  resource_type   TEXT DEFAULT 'study',
  format          TEXT DEFAULT 'article',
  platform        TEXT,
  duration        TEXT,
  url             TEXT,
  active          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);


-- ============================================================================
-- 3. AUTH TRIGGER — auto-create users row on Supabase Auth signup
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    'student',
    now()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================================
-- 4. ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills              ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profile     ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_history       ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_skills   ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_attempts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_resources  ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- 5. is_admin() HELPER (SECURITY DEFINER avoids infinite recursion in policies)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  );
$$;


-- ============================================================================
-- 6. RLS POLICIES — user (own data) + admin (all data)
-- ============================================================================

-- USERS
CREATE POLICY "Users can read own record"      ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own record"    ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can read all users"      ON users FOR SELECT USING (is_admin());
CREATE POLICY "Admins can update all users"    ON users FOR UPDATE USING (is_admin());

-- STUDENT_PROFILE
CREATE POLICY "Users can read own profile"     ON student_profile FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile"   ON student_profile FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile"   ON student_profile FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can read all profiles"   ON student_profile FOR SELECT USING (is_admin());

-- LOGIN_HISTORY
CREATE POLICY "Users can insert own login history" ON login_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can read own login history"   ON login_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can read all login history"  ON login_history FOR SELECT USING (is_admin());

-- ASSESSMENTS
CREATE POLICY "Users can insert own assessments"   ON assessments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can read own assessments"     ON assessments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can read all assessments"    ON assessments FOR SELECT USING (is_admin());

-- ASSESSMENT_SKILLS
CREATE POLICY "Users can insert assessment skills" ON assessment_skills FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM assessments WHERE assessment_id = assessment_skills.assessment_id AND user_id = auth.uid())
);
CREATE POLICY "Users can read own assessment skills" ON assessment_skills FOR SELECT USING (
  EXISTS (SELECT 1 FROM assessments WHERE assessment_id = assessment_skills.assessment_id AND user_id = auth.uid())
);
CREATE POLICY "Admins can read all assessment skills" ON assessment_skills FOR SELECT USING (is_admin());

-- INTERVIEW_ATTEMPTS
CREATE POLICY "Users can insert own interview attempts" ON interview_attempts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can read own interview attempts"   ON interview_attempts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can read all interview attempts"  ON interview_attempts FOR SELECT USING (is_admin());

-- TRAINING_PLANS
CREATE POLICY "Users can insert own training plans" ON training_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can read own training plans"   ON training_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own training plans" ON training_plans FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can read all training plans"  ON training_plans FOR SELECT USING (is_admin());

-- TRAINING_ITEMS
CREATE POLICY "Users can insert training items" ON training_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM training_plans WHERE plan_id = training_items.plan_id AND user_id = auth.uid())
);
CREATE POLICY "Users can read own training items" ON training_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM training_plans WHERE plan_id = training_items.plan_id AND user_id = auth.uid())
);
CREATE POLICY "Admins can read all training items" ON training_items FOR SELECT USING (is_admin());

-- QUESTIONS
CREATE POLICY "Anyone can read active questions" ON questions FOR SELECT USING (active = true);
CREATE POLICY "Admins can read all questions"    ON questions FOR SELECT USING (is_admin());
CREATE POLICY "Admins can insert questions"      ON questions FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins can update questions"      ON questions FOR UPDATE USING (is_admin());

-- SKILLS
CREATE POLICY "Anyone can read skills"           ON skills FOR SELECT USING (true);

-- TRAINING_RESOURCES
CREATE POLICY "Anyone can read training resources"  ON training_resources FOR SELECT USING (active = true);
CREATE POLICY "Admins can insert training resources" ON training_resources FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins can update training resources" ON training_resources FOR UPDATE USING (is_admin());


-- ============================================================================
-- 7. RPC FUNCTIONS
-- ============================================================================

-- Random assessment questions
CREATE OR REPLACE FUNCTION get_random_questions(
  p_category      TEXT,
  p_question_type TEXT,
  p_count         INT DEFAULT 10
)
RETURNS SETOF questions
LANGUAGE sql STABLE
AS $$
  SELECT *
  FROM questions
  WHERE category = p_category
    AND question_type = p_question_type
    AND active = true
  ORDER BY random()
  LIMIT p_count;
$$;

-- Random interview questions (handles 'mixed' category)
CREATE OR REPLACE FUNCTION get_random_interview_questions(
  p_category TEXT,
  p_count    INT DEFAULT 5
)
RETURNS SETOF questions
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  IF p_category = 'mixed' THEN
    RETURN QUERY
      SELECT * FROM questions
      WHERE question_type = 'interview' AND active = true
      ORDER BY random() LIMIT p_count;
  ELSE
    RETURN QUERY
      SELECT * FROM questions
      WHERE question_type = 'interview' AND category = p_category AND active = true
      ORDER BY random() LIMIT p_count;
  END IF;
END;
$$;

-- Atomic save: assessment + per-skill breakdown in one round-trip
CREATE OR REPLACE FUNCTION save_assessment_with_skills(
  p_user_id      UUID,
  p_type         TEXT,
  p_total_score  FLOAT,
  p_summary      TEXT,
  p_skill_scores JSONB
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_assessment_id INTEGER;
  sk                JSONB;
  matched_skill_id  INTEGER;
BEGIN
  INSERT INTO assessments (user_id, type, total_score, summary, completed_at)
  VALUES (p_user_id, p_type, p_total_score, p_summary, now())
  RETURNING assessment_id INTO new_assessment_id;

  FOR sk IN SELECT * FROM jsonb_array_elements(p_skill_scores)
  LOOP
    SELECT skill_id INTO matched_skill_id
    FROM skills
    WHERE LOWER(name) = LOWER(sk->>'skill_name')
    LIMIT 1;

    IF matched_skill_id IS NOT NULL THEN
      INSERT INTO assessment_skills (assessment_id, skill_id, skill_score)
      VALUES (new_assessment_id, matched_skill_id, (sk->>'skill_score')::FLOAT)
      ON CONFLICT (assessment_id, skill_id) DO UPDATE
        SET skill_score = EXCLUDED.skill_score;
    END IF;
  END LOOP;

  RETURN new_assessment_id;
END;
$$;

-- Grant execute permissions to authenticated users for all RPCs
GRANT EXECUTE ON FUNCTION public.is_admin()                                                  TO authenticated;
GRANT EXECUTE ON FUNCTION get_random_questions(TEXT, TEXT, INT)                              TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_random_interview_questions(TEXT, INT)                          TO authenticated, anon;
GRANT EXECUTE ON FUNCTION save_assessment_with_skills(UUID, TEXT, FLOAT, TEXT, JSONB)        TO authenticated;


-- ============================================================================
-- 8. SEED — SKILLS
-- ============================================================================
INSERT INTO skills (name, category, description) VALUES
  ('Database',              'technical', 'Relational and non-relational databases, SQL, data modeling'),
  ('Web Development',       'technical', 'Front-end and back-end web technologies'),
  ('Programming Concepts',  'technical', 'OOP, data types, control flow, software design'),
  ('Data Structures',       'technical', 'Arrays, linked lists, trees, graphs, hash tables'),
  ('Algorithms',            'technical', 'Algorithm design, sorting, searching, optimization'),
  ('Networking',            'technical', 'Network protocols, architectures, communication systems'),
  ('Software Engineering',  'technical', 'SDLC, testing, version control, best practices'),
  ('Security',              'technical', 'Authentication, encryption, vulnerability prevention'),
  ('Cybersecurity',         'technical', 'Ethical hacking, OWASP Top 10, applied security'),
  ('Operating Systems',     'technical', 'Process management, memory, file systems'),
  ('Cloud Computing',       'technical', 'IaaS, PaaS, SaaS, deployment, scalability'),
  ('DevOps',                'technical', 'CI/CD, containerization, infrastructure as code'),
  ('Communication',         'soft',      'Verbal and written professional communication'),
  ('Teamwork',              'soft',      'Collaboration to achieve shared goals'),
  ('Leadership',            'soft',      'Guiding teams, decision making, driving results'),
  ('Problem Solving',       'soft',      'Analytical thinking, creative approaches to challenges'),
  ('Time Management',       'soft',      'Organizing and prioritizing tasks to meet deadlines'),
  ('Emotional Intelligence','soft',      'Self-awareness, empathy, managing emotions'),
  ('Conflict Resolution',   'soft',      'Mediating disagreements, finding constructive solutions'),
  ('Adaptability',          'soft',      'Flexibility for new situations and technologies'),
  ('Networking (Professional)','soft',   'Building and maintaining professional relationships'),
  ('Stress Management',     'soft',      'Maintaining performance under pressure'),
  ('Interview Skills',      'soft',      'Preparation, presentation, communication for interviews');


-- ============================================================================
-- 9. SEED — QUESTIONS (180 total: 60 technical + 60 soft + 30 tech interview + 15 behavioral + 15 hr)
-- ============================================================================

INSERT INTO questions VALUES ('t1', 'What does SQL stand for?', '[{"text":"Structured Query Language"},{"text":"Simple Query Language"},{"text":"Standard Query Logic"},{"text":"System Query Language"}]'::jsonb, 0, 'Database', 'easy', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t2', 'Which HTTP method is used to update an existing resource?', '[{"text":"GET"},{"text":"POST"},{"text":"PUT"},{"text":"DELETE"}]'::jsonb, 2, 'Web Development', 'easy', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t3', 'What is the purpose of a foreign key in a relational database?', '[{"text":"To uniquely identify a record in a table"},{"text":"To create a link between two tables"},{"text":"To encrypt sensitive data"},{"text":"To index columns for faster searches"}]'::jsonb, 1, 'Database', 'easy', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t4', 'Which data structure uses FIFO (First In, First Out) principle?', '[{"text":"Stack"},{"text":"Queue"},{"text":"Tree"},{"text":"Hash Table"}]'::jsonb, 1, 'Data Structures', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t5', 'What does API stand for?', '[{"text":"Application Programming Interface"},{"text":"Application Process Integration"},{"text":"Automated Programming Interface"},{"text":"Application Protocol Interface"}]'::jsonb, 0, 'Web Development', 'easy', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t6', 'In Object-Oriented Programming, what is encapsulation?', '[{"text":"The ability of an object to take many forms"},{"text":"Bundling data and methods that operate on that data within a single unit"},{"text":"Creating new classes from existing classes"},{"text":"Hiding the implementation of a superclass"}]'::jsonb, 1, 'Programming Concepts', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t7', 'Which of the following is NOT a type of software testing?', '[{"text":"Unit Testing"},{"text":"Integration Testing"},{"text":"Compilation Testing"},{"text":"System Testing"}]'::jsonb, 2, 'Software Engineering', 'easy', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t8', 'What is the time complexity of binary search?', '[{"text":"O(1)"},{"text":"O(n)"},{"text":"O(log n)"},{"text":"O(n squared)"}]'::jsonb, 2, 'Algorithms', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t9', 'Which protocol is used for secure data transfer on the web?', '[{"text":"HTTP"},{"text":"FTP"},{"text":"HTTPS"},{"text":"SMTP"}]'::jsonb, 2, 'Networking', 'easy', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t10', 'In a relational database, what is normalization?', '[{"text":"Adding redundant data to improve query speed"},{"text":"Organizing data to reduce redundancy and dependency"},{"text":"Converting data to a standard format"},{"text":"Encrypting data for security"}]'::jsonb, 1, 'Database', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t11', 'What is the main advantage of using version control (e.g., Git)?', '[{"text":"It makes code run faster"},{"text":"It tracks changes and enables collaboration"},{"text":"It automatically fixes bugs"},{"text":"It compiles code to machine language"}]'::jsonb, 1, 'Software Engineering', 'easy', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t12', 'Which design pattern ensures a class has only one instance?', '[{"text":"Factory"},{"text":"Observer"},{"text":"Singleton"},{"text":"Strategy"}]'::jsonb, 2, 'Programming Concepts', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t13', 'What does CSS stand for?', '[{"text":"Computer Style Sheets"},{"text":"Cascading Style Sheets"},{"text":"Creative Style System"},{"text":"Colorful Style Sheets"}]'::jsonb, 1, 'Web Development', 'easy', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t14', 'Which of the following is a NoSQL database?', '[{"text":"MySQL"},{"text":"PostgreSQL"},{"text":"MongoDB"},{"text":"Oracle"}]'::jsonb, 2, 'Database', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t15', 'What is the purpose of a firewall in network security?', '[{"text":"To speed up internet connections"},{"text":"To monitor and filter incoming and outgoing network traffic"},{"text":"To store backup copies of data"},{"text":"To compress data for faster transfer"}]'::jsonb, 1, 'Networking', 'easy', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t16', 'What is polymorphism in Object-Oriented Programming?', '[{"text":"The ability to create private variables"},{"text":"The ability of different classes to respond to the same method call in different ways"},{"text":"A way to store multiple data types in one variable"},{"text":"A technique for compressing code files"}]'::jsonb, 1, 'Programming Concepts', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t17', 'Which sorting algorithm has the best average-case time complexity?', '[{"text":"Bubble Sort - O(n squared)"},{"text":"Merge Sort - O(n log n)"},{"text":"Selection Sort - O(n squared)"},{"text":"Insertion Sort - O(n squared)"}]'::jsonb, 1, 'Algorithms', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t18', 'What is a REST API?', '[{"text":"A database management tool"},{"text":"A programming language for web apps"},{"text":"An architectural style for web services using HTTP methods"},{"text":"A type of web browser"}]'::jsonb, 2, 'Web Development', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t19', 'What does DNS stand for and what does it do?', '[{"text":"Data Network System - compresses data"},{"text":"Domain Name System - translates domain names to IP addresses"},{"text":"Digital Network Service - provides internet access"},{"text":"Dynamic Name Server - manages user accounts"}]'::jsonb, 1, 'Networking', 'easy', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t20', 'What is a linked list?', '[{"text":"A fixed-size data container"},{"text":"A linear data structure where each element points to the next"},{"text":"A type of database table"},{"text":"A graphical user interface element"}]'::jsonb, 1, 'Data Structures', 'easy', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t21', 'What is the difference between a compiler and an interpreter?', '[{"text":"Compilers are faster, interpreters are slower - no other difference"},{"text":"A compiler translates all code at once before execution; an interpreter translates line by line during execution"},{"text":"Compilers only work with Java; interpreters work with Python"},{"text":"There is no difference - they are the same thing"}]'::jsonb, 1, 'Programming Concepts', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t22', 'What is an SQL JOIN used for?', '[{"text":"To delete records from multiple tables"},{"text":"To combine rows from two or more tables based on a related column"},{"text":"To create a backup of a database"},{"text":"To encrypt data in transit"}]'::jsonb, 1, 'Database', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t23', 'What does the acronym SDLC stand for?', '[{"text":"Software Design Language Code"},{"text":"System Development Life Cycle"},{"text":"Software Development Life Cycle"},{"text":"Secure Data Link Connection"}]'::jsonb, 2, 'Software Engineering', 'easy', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t24', 'What is the purpose of a hash table?', '[{"text":"To sort data in order"},{"text":"To store key-value pairs for fast lookup"},{"text":"To encrypt sensitive information"},{"text":"To create graphical charts"}]'::jsonb, 1, 'Data Structures', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t25', 'What is recursion in programming?', '[{"text":"A loop that runs infinitely"},{"text":"A function that calls itself to solve smaller subproblems"},{"text":"A way to store data permanently"},{"text":"A technique for optimizing database queries"}]'::jsonb, 1, 'Algorithms', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t26', 'What is the TCP/IP model?', '[{"text":"A programming framework for web apps"},{"text":"A layered network protocol model that governs internet communication"},{"text":"A database management system"},{"text":"A software testing methodology"}]'::jsonb, 1, 'Networking', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t27', 'What is Agile methodology in software development?', '[{"text":"A method that completes all planning before any coding begins"},{"text":"An iterative approach that delivers work in small increments with continuous feedback"},{"text":"A testing-only framework"},{"text":"A documentation standard for APIs"}]'::jsonb, 1, 'Software Engineering', 'easy', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t28', 'What is the difference between == and === in JavaScript?', '[{"text":"There is no difference"},{"text":"== compares value only; === compares value and type"},{"text":"=== is used for assignment; == is for comparison"},{"text":"== is faster than ==="}]'::jsonb, 1, 'Web Development', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t29', 'What is a binary tree?', '[{"text":"A tree where each node has at most two children"},{"text":"A tree with exactly two nodes"},{"text":"A data structure that stores only binary numbers"},{"text":"A type of graph with no cycles"}]'::jsonb, 0, 'Data Structures', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t30', 'What is the purpose of an index in a database?', '[{"text":"To encrypt table data"},{"text":"To create a backup of the table"},{"text":"To speed up data retrieval by creating a pointer structure"},{"text":"To limit the number of rows in a table"}]'::jsonb, 2, 'Database', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t31', 'What is a stored procedure in a database?', '[{"text":"A backup copy of a database table"},{"text":"A precompiled set of SQL statements stored in the database that can be executed as a unit"},{"text":"A method for encrypting database connections"},{"text":"A log file that records all database transactions"}]'::jsonb, 1, 'Database', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t32', 'What is the difference between INNER JOIN and LEFT JOIN in SQL?', '[{"text":"There is no difference; they return the same results"},{"text":"INNER JOIN returns only matching rows from both tables; LEFT JOIN returns all rows from the left table and matching rows from the right"},{"text":"LEFT JOIN is faster than INNER JOIN"},{"text":"INNER JOIN works on three tables; LEFT JOIN works on two"}]'::jsonb, 1, 'Database', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t33', 'What is an ACID transaction in databases?', '[{"text":"A type of NoSQL query optimization"},{"text":"A set of properties (Atomicity, Consistency, Isolation, Durability) that guarantee reliable transactions"},{"text":"A data encryption standard for databases"},{"text":"A method for compressing database files"}]'::jsonb, 1, 'Database', 'hard', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t34', 'What is a deadlock in a database system?', '[{"text":"When a query takes too long to execute"},{"text":"When a database runs out of storage space"},{"text":"When two or more transactions are waiting for each other to release locks, causing all to be stuck"},{"text":"When a database connection times out"}]'::jsonb, 2, 'Database', 'hard', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t35', 'What does the DOM stand for in web development?', '[{"text":"Data Object Model"},{"text":"Document Object Model"},{"text":"Dynamic Output Manager"},{"text":"Display Orientation Mode"}]'::jsonb, 1, 'Web Development', 'easy', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t36', 'What is the purpose of the localStorage API in web browsers?', '[{"text":"To store data on the server"},{"text":"To store key-value pairs persistently in the user''s browser with no expiration"},{"text":"To cache CSS files for faster loading"},{"text":"To manage browser bookmarks programmatically"}]'::jsonb, 1, 'Web Development', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t37', 'What is CORS in web development?', '[{"text":"A CSS layout framework"},{"text":"Cross-Origin Resource Sharing - a mechanism that allows restricted resources to be requested from another domain"},{"text":"A JavaScript testing library"},{"text":"A type of web server configuration file"}]'::jsonb, 1, 'Web Development', 'hard', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t38', 'What is the purpose of a CDN (Content Delivery Network)?', '[{"text":"To write server-side code"},{"text":"To distribute content across multiple geographic servers for faster delivery to users"},{"text":"To compile JavaScript to machine code"},{"text":"To manage database connections"}]'::jsonb, 1, 'Web Development', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t39', 'What is the difference between let, const, and var in JavaScript?', '[{"text":"They are all identical in behavior"},{"text":"var is function-scoped; let and const are block-scoped; const cannot be reassigned"},{"text":"let is for numbers; const is for strings; var is for objects"},{"text":"const is faster than let and var"}]'::jsonb, 1, 'Web Development', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t40', 'What is the purpose of an abstract class in OOP?', '[{"text":"To create objects directly without a constructor"},{"text":"To provide a base class that cannot be instantiated and may contain abstract methods for subclasses to implement"},{"text":"To store global variables accessible by all classes"},{"text":"To speed up program execution"}]'::jsonb, 1, 'Programming Concepts', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t41', 'What is the difference between pass-by-value and pass-by-reference?', '[{"text":"There is no difference in modern programming languages"},{"text":"Pass-by-value sends a copy of the data; pass-by-reference sends the memory address of the data"},{"text":"Pass-by-value is used for strings; pass-by-reference is used for numbers"},{"text":"Pass-by-reference is always faster than pass-by-value"}]'::jsonb, 1, 'Programming Concepts', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t42', 'What is a closure in programming?', '[{"text":"A way to terminate a program immediately"},{"text":"A function that has access to variables from its outer (enclosing) scope even after the outer function has returned"},{"text":"A method for closing database connections"},{"text":"A design pattern for shutting down servers gracefully"}]'::jsonb, 1, 'Programming Concepts', 'hard', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t43', 'What is the difference between an interface and an abstract class?', '[{"text":"They are the same thing with different names"},{"text":"An interface defines only method signatures with no implementation; an abstract class can have both abstract and concrete methods"},{"text":"Abstract classes are used in Java only; interfaces are used in Python only"},{"text":"Interfaces can have constructors; abstract classes cannot"}]'::jsonb, 1, 'Programming Concepts', 'hard', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t44', 'What is a graph data structure?', '[{"text":"A visual chart for displaying data"},{"text":"A collection of nodes (vertices) connected by edges, used to represent relationships"},{"text":"A type of array with two dimensions"},{"text":"A sorted version of a linked list"}]'::jsonb, 1, 'Data Structures', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t45', 'What is the difference between an array and a linked list?', '[{"text":"Arrays are faster for all operations"},{"text":"Arrays use contiguous memory with O(1) random access; linked lists use nodes with pointers and O(1) insertion/deletion at known positions"},{"text":"Linked lists can only store integers"},{"text":"There is no practical difference between them"}]'::jsonb, 1, 'Data Structures', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t46', 'What is a heap data structure?', '[{"text":"A memory allocation area for dynamic variables"},{"text":"A complete binary tree where each parent is greater (max-heap) or smaller (min-heap) than its children"},{"text":"A type of hash table with sorted keys"},{"text":"A stack implemented using an array"}]'::jsonb, 1, 'Data Structures', 'hard', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t47', 'What is a trie (prefix tree) used for?', '[{"text":"Sorting numerical data efficiently"},{"text":"Efficient storage and retrieval of strings, commonly used for autocomplete and spell checking"},{"text":"Balancing binary search trees"},{"text":"Managing memory allocation in operating systems"}]'::jsonb, 1, 'Data Structures', 'hard', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t48', 'What is the time complexity of the quicksort algorithm in the worst case?', '[{"text":"O(n)"},{"text":"O(n log n)"},{"text":"O(n squared)"},{"text":"O(log n)"}]'::jsonb, 2, 'Algorithms', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t49', 'What is dynamic programming?', '[{"text":"Programming that changes at runtime"},{"text":"A method for solving complex problems by breaking them into overlapping subproblems and storing their solutions"},{"text":"A type of object-oriented programming"},{"text":"Writing code that dynamically adapts to user input"}]'::jsonb, 1, 'Algorithms', 'hard', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t50', 'What is the difference between BFS and DFS graph traversal?', '[{"text":"BFS uses a stack; DFS uses a queue"},{"text":"BFS explores all neighbors at the current depth before moving deeper (uses a queue); DFS goes as deep as possible before backtracking (uses a stack)"},{"text":"BFS only works on trees; DFS works on all graphs"},{"text":"There is no difference; they produce identical results"}]'::jsonb, 1, 'Algorithms', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t51', 'What is the greedy algorithm approach?', '[{"text":"An algorithm that always finds the globally optimal solution"},{"text":"An approach that makes the locally optimal choice at each step, hoping to find a global optimum"},{"text":"An algorithm that uses the most memory possible for speed"},{"text":"A brute-force method that checks every possible solution"}]'::jsonb, 1, 'Algorithms', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t52', 'What is the OSI model in networking?', '[{"text":"A programming framework for building network applications"},{"text":"A seven-layer conceptual model that describes how network communication functions"},{"text":"An internet service provider protocol"},{"text":"A wireless networking standard"}]'::jsonb, 1, 'Networking', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t53', 'What is the difference between TCP and UDP?', '[{"text":"TCP is wireless; UDP is wired"},{"text":"TCP is connection-oriented and reliable with guaranteed delivery; UDP is connectionless, faster, but with no delivery guarantee"},{"text":"UDP is more secure than TCP"},{"text":"TCP is used for email only; UDP is used for web browsing only"}]'::jsonb, 1, 'Networking', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t54', 'What is a subnet mask used for?', '[{"text":"To encrypt network traffic"},{"text":"To divide an IP address into network and host portions, defining the network boundary"},{"text":"To speed up DNS resolution"},{"text":"To block malicious websites"}]'::jsonb, 1, 'Networking', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t55', 'What is a VPN (Virtual Private Network)?', '[{"text":"A type of antivirus software"},{"text":"A technology that creates a secure, encrypted connection over a less secure network like the internet"},{"text":"A physical cable connecting two networks"},{"text":"A web development framework"}]'::jsonb, 1, 'Networking', 'easy', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t56', 'What is the purpose of unit testing in software development?', '[{"text":"To test the entire application as a whole"},{"text":"To verify that individual components or functions work correctly in isolation"},{"text":"To test network connectivity"},{"text":"To measure the speed of the application"}]'::jsonb, 1, 'Software Engineering', 'easy', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t57', 'What is CI/CD in software engineering?', '[{"text":"A programming language pair"},{"text":"Continuous Integration and Continuous Delivery/Deployment - automating code integration, testing, and deployment"},{"text":"A database replication method"},{"text":"A code commenting standard"}]'::jsonb, 1, 'Software Engineering', 'medium', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t58', 'What is the purpose of a code review in software development?', '[{"text":"To slow down the development process"},{"text":"To have peers examine code changes for bugs, style, and design issues before merging"},{"text":"To automatically compile the code"},{"text":"To generate documentation from code comments"}]'::jsonb, 1, 'Software Engineering', 'easy', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t59', 'What is a microservices architecture?', '[{"text":"An architecture where the entire application is a single deployable unit"},{"text":"An approach where an application is built as a collection of small, independent services that communicate over APIs"},{"text":"A design pattern for mobile applications only"},{"text":"A method for minifying JavaScript code"}]'::jsonb, 1, 'Software Engineering', 'hard', 'assessment', 'technical', NULL, true, now());

INSERT INTO questions VALUES ('t60', 'What is technical debt in software engineering?', '[{"text":"The cost of purchasing software licenses"},{"text":"The implied cost of future rework caused by choosing a quick or easy solution now instead of a better approach"},{"text":"Money owed to developers for overtime work"},{"text":"The budget allocated for hardware upgrades"}]'::jsonb, 1, 'Software Engineering', 'medium', 'assessment', 'technical', NULL, true, now());

-- ============================================================
-- SOFT SKILLS ASSESSMENT QUESTIONS (question_type='assessment', category='soft')
-- ============================================================

INSERT INTO questions VALUES ('s1', 'When working in a team and a conflict arises between two members, you should:', '[{"text":"Ignore the conflict and hope it resolves itself"},{"text":"Take sides with the person you agree with"},{"text":"Facilitate a discussion to understand both perspectives and find a solution"},{"text":"Report the issue to management immediately"}]'::jsonb, 2, 'Conflict Resolution', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s2', 'Which approach is most effective for managing your time on a project with multiple deadlines?', '[{"text":"Work on whatever feels most urgent at the moment"},{"text":"Prioritize tasks based on importance and deadline, creating a schedule"},{"text":"Focus on the easiest tasks first to build momentum"},{"text":"Work on all tasks simultaneously to make progress on everything"}]'::jsonb, 1, 'Time Management', 'easy', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s3', 'During a presentation, you notice the audience seems disengaged. What should you do?', '[{"text":"Continue with the presentation as planned"},{"text":"Speed up to finish quickly"},{"text":"Ask a question or change your approach to re-engage the audience"},{"text":"End the presentation early"}]'::jsonb, 2, 'Communication', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s4', 'When receiving constructive criticism from a colleague, the best response is to:', '[{"text":"Defend your work and explain why they are wrong"},{"text":"Listen carefully, ask for specific examples, and consider how to improve"},{"text":"Accept it silently without asking questions"},{"text":"Immediately change everything they suggested"}]'::jsonb, 1, 'Emotional Intelligence', 'easy', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s5', 'You are given a task that you are unsure how to complete. What is the best approach?', '[{"text":"Pretend you know how and figure it out later"},{"text":"Refuse the task since you cannot do it"},{"text":"Research the task, attempt it, and ask for guidance when needed"},{"text":"Wait for someone else to do it"}]'::jsonb, 2, 'Problem Solving', 'easy', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s6', 'Effective written communication in a professional email should:', '[{"text":"Use informal language to be friendly"},{"text":"Be as long as possible to cover all details"},{"text":"Be clear, concise, and professionally structured"},{"text":"Use technical jargon to show expertise"}]'::jsonb, 2, 'Communication', 'easy', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s7', 'When leading a team meeting, which approach ensures productive discussions?', '[{"text":"Let everyone talk freely without an agenda"},{"text":"Prepare an agenda, manage time, and ensure all members contribute"},{"text":"Only allow senior members to speak"},{"text":"Keep the meeting as short as possible regardless of topics covered"}]'::jsonb, 1, 'Leadership', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s8', 'Adaptability in the workplace means:', '[{"text":"Always agreeing with your manager"},{"text":"Being able to adjust to new conditions, technologies, and challenges"},{"text":"Changing your opinion whenever someone disagrees"},{"text":"Working overtime without complaint"}]'::jsonb, 1, 'Adaptability', 'easy', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s9', 'Which skill is most important for building professional networks?', '[{"text":"Technical expertise only"},{"text":"Active listening and genuine interest in others"},{"text":"Sending as many LinkedIn requests as possible"},{"text":"Talking about yourself and your achievements"}]'::jsonb, 1, 'Networking', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s10', 'When working under pressure with a tight deadline, you should:', '[{"text":"Panic and work as fast as possible without checking quality"},{"text":"Ask for a deadline extension immediately"},{"text":"Prioritize critical tasks, stay focused, and communicate progress"},{"text":"Skip important steps to save time"}]'::jsonb, 2, 'Stress Management', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s11', 'What is the STAR method used for in interviews?', '[{"text":"A rating system for candidates"},{"text":"A structured way to answer behavioral questions (Situation, Task, Action, Result)"},{"text":"A technical assessment framework"},{"text":"A leadership evaluation tool"}]'::jsonb, 1, 'Interview Skills', 'easy', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s12', 'When you disagree with a team decision, the professional approach is to:', '[{"text":"Express your disagreement publicly to embarrass the decision maker"},{"text":"Go along with it silently even though you disagree"},{"text":"Present your alternative viewpoint respectfully with supporting reasoning"},{"text":"Refuse to participate in implementing the decision"}]'::jsonb, 2, 'Teamwork', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s13', 'A colleague takes credit for your idea in a meeting. How do you handle it?', '[{"text":"Confront them aggressively in front of everyone"},{"text":"Say nothing and let it go forever"},{"text":"Speak to them privately, clarify the situation, and ensure proper credit going forward"},{"text":"Complain to others about the colleague behind their back"}]'::jsonb, 2, 'Conflict Resolution', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s14', 'You have three tasks due the same day. The most productive strategy is to:', '[{"text":"Start with the largest task and hope you finish in time"},{"text":"Break each task into smaller steps, estimate time for each, and schedule accordingly"},{"text":"Do a little of each task in random order"},{"text":"Pull an all-nighter the night before"}]'::jsonb, 1, 'Time Management', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s15', 'Which of the following best demonstrates emotional intelligence at work?', '[{"text":"Hiding your emotions at all times"},{"text":"Recognizing your own stress triggers and managing your reactions before responding"},{"text":"Always being the loudest voice in the room"},{"text":"Avoiding all emotional topics with colleagues"}]'::jsonb, 1, 'Emotional Intelligence', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s16', 'When a team project fails, a good leader should:', '[{"text":"Blame the weakest team member"},{"text":"Take full responsibility alone and not involve the team"},{"text":"Analyze what went wrong as a team, learn from it, and plan improvements"},{"text":"Pretend the failure never happened"}]'::jsonb, 2, 'Leadership', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s17', 'Active listening involves:', '[{"text":"Waiting for your turn to speak while the other person talks"},{"text":"Paying full attention, asking clarifying questions, and paraphrasing to confirm understanding"},{"text":"Nodding while checking your phone"},{"text":"Interrupting with your own experiences to show empathy"}]'::jsonb, 1, 'Communication', 'easy', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s18', 'Your manager assigns you a task using a technology you have never used. What do you do?', '[{"text":"Tell them you cannot do it"},{"text":"Accept the challenge, research the technology, and ask for reasonable time to learn"},{"text":"Pretend you know it and copy-paste solutions from the internet"},{"text":"Ask a colleague to do it for you secretly"}]'::jsonb, 1, 'Adaptability', 'easy', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s19', 'What is the best way to give negative feedback to a teammate?', '[{"text":"Be blunt and direct without sugarcoating anything"},{"text":"Avoid giving negative feedback entirely to keep peace"},{"text":"Use a balanced approach: acknowledge positives, address the issue specifically, and suggest improvements"},{"text":"Send an anonymous email so they do not know it is from you"}]'::jsonb, 2, 'Teamwork', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s20', 'When faced with an unfamiliar problem, the best problem-solving approach is to:', '[{"text":"Give up and move to something else"},{"text":"Break the problem into smaller parts, research each part, and test solutions incrementally"},{"text":"Ask someone else to solve it for you"},{"text":"Try the first solution that comes to mind and hope it works"}]'::jsonb, 1, 'Problem Solving', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s21', 'You are in a meeting and two colleagues begin arguing heatedly. As a neutral party, what should you do?', '[{"text":"Stay silent and wait for it to end on its own"},{"text":"Side with whoever has more seniority"},{"text":"Calmly intervene, acknowledge both viewpoints, and redirect the discussion toward finding a solution"},{"text":"Leave the meeting to avoid the uncomfortable situation"}]'::jsonb, 2, 'Conflict Resolution', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s22', 'What is the Eisenhower Matrix used for?', '[{"text":"Evaluating employee performance"},{"text":"Prioritizing tasks by categorizing them as urgent/not urgent and important/not important"},{"text":"Creating project timelines"},{"text":"Calculating project budgets"}]'::jsonb, 1, 'Time Management', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s23', 'A team member repeatedly misses deadlines. As a team lead, your best approach is to:', '[{"text":"Report them to HR immediately"},{"text":"Ignore the issue since it is not your problem"},{"text":"Have a private conversation to understand the root cause and work together on a plan for improvement"},{"text":"Reassign all their tasks to other team members without discussing it"}]'::jsonb, 2, 'Leadership', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s24', 'When explaining a complex technical concept to a non-technical audience, you should:', '[{"text":"Use all the technical terminology so they learn the correct terms"},{"text":"Skip the explanation entirely since they will not understand"},{"text":"Use simple language, analogies, and visual aids to make the concept relatable"},{"text":"Speak faster to get through the material quickly"}]'::jsonb, 2, 'Communication', 'easy', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s25', 'You notice a teammate seems stressed and withdrawn lately. What is the most emotionally intelligent response?', '[{"text":"Ignore it since it is none of your business"},{"text":"Tell everyone on the team about your observation"},{"text":"Approach them privately, express concern, and offer support without pressuring them"},{"text":"Report their behavior to your manager"}]'::jsonb, 2, 'Emotional Intelligence', 'easy', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s26', 'When solving a problem, what distinguishes root cause analysis from treating symptoms?', '[{"text":"There is no real difference between the two approaches"},{"text":"Root cause analysis identifies the underlying reason for the problem to prevent recurrence; symptom treatment only addresses the immediate effect"},{"text":"Treating symptoms is always better because it is faster"},{"text":"Root cause analysis only works for technical problems, not people problems"}]'::jsonb, 1, 'Problem Solving', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s27', 'What is the Pomodoro Technique?', '[{"text":"A leadership framework for managing remote teams"},{"text":"A time management method using 25-minute focused work intervals separated by short breaks"},{"text":"A conflict resolution strategy involving three-way meetings"},{"text":"A method for conducting code reviews"}]'::jsonb, 1, 'Time Management', 'easy', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s28', 'Your company is restructuring and your role is changing significantly. The best way to handle this is to:', '[{"text":"Immediately start looking for a new job"},{"text":"Complain to colleagues about the changes"},{"text":"Stay open-minded, ask questions to understand the new role, seek training, and communicate concerns constructively"},{"text":"Refuse to accept the changes and continue doing your old job"}]'::jsonb, 2, 'Adaptability', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s29', 'At a professional networking event, the most effective strategy is to:', '[{"text":"Hand out as many business cards as possible to everyone in the room"},{"text":"Stay near the food table and avoid conversations"},{"text":"Focus on building a few meaningful connections by asking thoughtful questions and actively listening"},{"text":"Only talk to people who work at companies you want to join"}]'::jsonb, 2, 'Networking', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s30', 'Your workload has become overwhelming and is affecting your well-being. What should you do?', '[{"text":"Work longer hours without telling anyone until you burn out"},{"text":"Quit your job immediately"},{"text":"Communicate with your manager about your workload, propose solutions, and set realistic boundaries"},{"text":"Lower the quality of your work so you can finish faster"}]'::jsonb, 2, 'Stress Management', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s31', 'Before a job interview, the most important preparation step is to:', '[{"text":"Memorize scripted answers to every possible question"},{"text":"Research the company, understand the role, and prepare examples from your experience that demonstrate relevant skills"},{"text":"Buy an expensive new outfit to make a strong first impression"},{"text":"Relax and plan to improvise all answers"}]'::jsonb, 1, 'Interview Skills', 'easy', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s32', 'A new team member is struggling to integrate into the group. As a teammate, you should:', '[{"text":"Let them figure it out on their own since that is how you learned"},{"text":"Proactively include them in conversations, offer guidance, and introduce them to key people"},{"text":"Only help them if your manager tells you to"},{"text":"Tell them they need to be more outgoing"}]'::jsonb, 1, 'Teamwork', 'easy', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s33', 'A client is upset about a delayed project delivery. The best response is to:', '[{"text":"Blame your team members for the delay"},{"text":"Make excuses and minimize the issue"},{"text":"Acknowledge the delay sincerely, explain what happened, present a recovery plan, and commit to regular updates"},{"text":"Ignore their messages until the project is completed"}]'::jsonb, 2, 'Communication', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s34', 'What is the key difference between a manager and a leader?', '[{"text":"A manager has a title; a leader does not - otherwise they are the same"},{"text":"A manager focuses on processes and tasks; a leader inspires, motivates, and drives vision"},{"text":"A leader never has to deal with budgets or deadlines"},{"text":"A manager cannot also be a leader"}]'::jsonb, 1, 'Leadership', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s35', 'You realize you made an error in a report that has already been shared with the team. What do you do?', '[{"text":"Hope nobody notices and do nothing"},{"text":"Blame the error on unclear instructions from your manager"},{"text":"Promptly notify the team about the error, provide the corrected version, and take steps to prevent similar mistakes"},{"text":"Delete the report and pretend it was never sent"}]'::jsonb, 2, 'Emotional Intelligence', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s36', 'When brainstorming solutions to a complex problem, the most productive approach is to:', '[{"text":"Immediately go with the first idea suggested"},{"text":"Criticize each idea as soon as it is mentioned"},{"text":"Encourage all ideas without judgment first, then evaluate and refine the most promising ones"},{"text":"Only accept ideas from the most experienced person in the room"}]'::jsonb, 2, 'Problem Solving', 'easy', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s37', 'How should you handle a situation where two of your commitments have conflicting deadlines?', '[{"text":"Miss the less important deadline without telling anyone"},{"text":"Communicate early with all stakeholders about the conflict, negotiate priorities, and propose adjusted timelines"},{"text":"Work on both at the same time, switching back and forth every few minutes"},{"text":"Do the easier one and abandon the other"}]'::jsonb, 1, 'Time Management', 'hard', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s38', 'After a job interview, which follow-up action is most professional?', '[{"text":"Send multiple follow-up emails every day until you hear back"},{"text":"Send a brief thank-you email within 24 hours referencing specific topics discussed"},{"text":"Call the interviewer repeatedly to check on the status"},{"text":"Post about the interview on social media tagging the company"}]'::jsonb, 1, 'Interview Skills', 'easy', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s39', 'Your team has been asked to adopt a completely new project management tool. What is the best attitude to take?', '[{"text":"Refuse to use it and continue with the old tool"},{"text":"Complain loudly in team meetings about the change"},{"text":"Embrace the change, invest time in learning the new tool, and help teammates who are struggling with it"},{"text":"Use both tools simultaneously, creating double the work"}]'::jsonb, 2, 'Adaptability', 'easy', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s40', 'A colleague keeps interrupting you during a team meeting. The most professional response is to:', '[{"text":"Start interrupting them back to give them a taste of their own medicine"},{"text":"Remain calm and say I appreciate your input - let me finish my point and then I would love to hear your thoughts"},{"text":"Stop contributing to the meeting entirely"},{"text":"Send them an angry message after the meeting"}]'::jsonb, 1, 'Conflict Resolution', 'easy', 'assessment', 'soft', NULL, true, now());

-- NEW SOFT SKILLS QUESTIONS (s41-s60)

INSERT INTO questions VALUES ('s41', 'You are presenting a quarterly report and your manager publicly questions your data accuracy in front of the entire team. What is the best response?', '[{"text":"Get defensive and insist your data is correct"},{"text":"Acknowledge the concern calmly, offer to verify the data together, and follow up with corrected findings if needed"},{"text":"Shut down and stop presenting"},{"text":"Challenge your manager''s credibility in return"}]'::jsonb, 1, 'Stress Management', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s42', 'During a job interview, you are asked a question you do not know the answer to. The best approach is to:', '[{"text":"Make up an answer that sounds convincing"},{"text":"Stay silent until the interviewer moves on"},{"text":"Acknowledge honestly that you are unsure, share your thought process or related knowledge, and express willingness to learn"},{"text":"Redirect the conversation to a completely different topic"}]'::jsonb, 2, 'Interview Skills', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s43', 'You meet a senior professional in your industry at a conference. What is the most effective way to make a lasting impression?', '[{"text":"Immediately ask them for a job or referral"},{"text":"Talk extensively about your achievements and qualifications"},{"text":"Ask thoughtful questions about their work, listen attentively, and follow up with a personalized message afterward"},{"text":"Exchange business cards and move on to the next person as quickly as possible"}]'::jsonb, 2, 'Networking', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s44', 'Your team is stuck on a problem that no one seems to be able to solve. Which approach is most effective?', '[{"text":"Wait for the manager to come up with a solution"},{"text":"Reframe the problem from a different angle, gather diverse perspectives, and consider unconventional solutions"},{"text":"Blame the person who created the problem in the first place"},{"text":"Move on to a different task and hope the problem resolves itself"}]'::jsonb, 1, 'Problem Solving', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s45', 'As a team leader, you discover that one high-performing team member is demotivating others with their attitude. What do you do?', '[{"text":"Ignore it because their performance numbers are excellent"},{"text":"Address the behavior privately, explain its impact on the team, set clear expectations for change, and offer support"},{"text":"Publicly call out the behavior in a team meeting to set an example"},{"text":"Transfer them to another team immediately"}]'::jsonb, 1, 'Leadership', 'hard', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s46', 'A teammate submits work that you believe contains significant errors. How should you handle this?', '[{"text":"Fix the errors yourself without saying anything to avoid conflict"},{"text":"Report the errors to your manager before talking to the teammate"},{"text":"Discuss the concerns directly with your teammate in a constructive way, offering to help resolve the issues together"},{"text":"Point out the errors publicly during the next team meeting"}]'::jsonb, 2, 'Teamwork', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s47', 'You need to deliver bad news to a client about a significant project setback. What communication approach is most effective?', '[{"text":"Delay telling them as long as possible and hope the situation improves"},{"text":"Send a brief email with minimal details to downplay the issue"},{"text":"Communicate promptly and transparently, take ownership, explain the impact, and present a concrete plan to address the situation"},{"text":"Blame external factors entirely and offer no solutions"}]'::jsonb, 2, 'Communication', 'hard', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s48', 'A colleague confides in you that they are struggling with personal issues that are affecting their work. How do you respond?', '[{"text":"Tell them to keep personal issues out of the workplace"},{"text":"Share their situation with the rest of the team so everyone can be understanding"},{"text":"Listen empathetically, offer support, suggest professional resources if appropriate, and respect their confidentiality"},{"text":"Immediately report them to HR for underperformance"}]'::jsonb, 2, 'Emotional Intelligence', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s49', 'You consistently find yourself working late because tasks take longer than expected. What is the best long-term solution?', '[{"text":"Accept that working late is simply part of having a job"},{"text":"Track how you spend your time, identify patterns of inefficiency, improve your estimation skills, and learn to set realistic expectations"},{"text":"Rush through tasks to finish faster regardless of quality"},{"text":"Delegate all difficult tasks to other team members"}]'::jsonb, 1, 'Time Management', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s50', 'Two departments in your organization have conflicting priorities that are blocking your project. How do you resolve this?', '[{"text":"Escalate to upper management immediately without attempting to resolve it yourself"},{"text":"Choose one department''s priorities and ignore the other"},{"text":"Arrange a meeting with stakeholders from both departments to understand each side''s constraints, identify shared goals, and negotiate a workable compromise"},{"text":"Wait until one department gives in"}]'::jsonb, 2, 'Conflict Resolution', 'hard', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s51', 'Your industry is rapidly adopting AI tools that could change how your role works. What is the best way to respond?', '[{"text":"Resist the change and continue using traditional methods exclusively"},{"text":"Ignore it and assume it will not affect your position"},{"text":"Proactively learn about the new tools, experiment with them, and identify ways they can enhance your productivity while developing complementary skills"},{"text":"Panic and immediately start looking for a career change"}]'::jsonb, 2, 'Adaptability', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s52', 'You have been working on a high-stakes project for weeks and feel on the verge of burnout. What is the most productive way to handle this?', '[{"text":"Push through and finish at all costs regardless of your health"},{"text":"Call in sick for a week without telling anyone why"},{"text":"Communicate your situation to your manager, request support or adjusted timelines, and take deliberate breaks to recharge"},{"text":"Reduce your effort without telling anyone and hope no one notices"}]'::jsonb, 2, 'Stress Management', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s53', 'In a panel interview, the interviewers seem to disagree with each other about the ideal candidate profile. How do you navigate this?', '[{"text":"Agree with whichever interviewer seems most senior"},{"text":"Point out their disagreement and ask them to clarify"},{"text":"Demonstrate flexibility by addressing each interviewer''s concerns and showing you can add value from multiple angles"},{"text":"Focus only on answering the questions from the interviewer you connect with most"}]'::jsonb, 2, 'Interview Skills', 'hard', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s54', 'You want to build a professional relationship with someone you admire in your field but have no direct connection to. What is the best first step?', '[{"text":"Send them a lengthy message listing all your qualifications and asking for mentorship"},{"text":"Engage meaningfully with their public work first, then reach out with a specific, thoughtful question or comment that shows genuine interest"},{"text":"Add them on every social media platform simultaneously"},{"text":"Wait until you meet them in person at a conference someday"}]'::jsonb, 1, 'Networking', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s55', 'A complex problem keeps recurring in your project despite multiple attempted fixes. What approach should you take?', '[{"text":"Apply the same fix again but more carefully"},{"text":"Conduct a systematic analysis to identify why previous solutions failed, map all contributing factors, and address the root cause rather than symptoms"},{"text":"Accept that some problems cannot be solved"},{"text":"Assign the problem to a different team member each time it occurs"}]'::jsonb, 1, 'Problem Solving', 'hard', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s56', 'Your team is working remotely and you notice collaboration and morale are declining. As a leader, what do you do?', '[{"text":"Mandate that everyone return to the office immediately"},{"text":"Add more meetings to the calendar to force interaction"},{"text":"Initiate regular check-ins, create opportunities for informal connection, solicit feedback on what the team needs, and adjust processes accordingly"},{"text":"Ignore it since remote workers should be self-motivated"}]'::jsonb, 2, 'Leadership', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s57', 'A team member from a different cultural background has a communication style that is very different from yours, leading to misunderstandings. How do you handle this?', '[{"text":"Expect them to adapt to your communication style since they joined your team"},{"text":"Avoid communicating with them directly and use a third party instead"},{"text":"Make an effort to understand their communication style, ask clarifying questions respectfully, and find a mutually comfortable way to collaborate"},{"text":"Report the communication issues to HR as a cultural conflict"}]'::jsonb, 2, 'Teamwork', 'medium', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s58', 'You have written an email response to a colleague who upset you. Before sending it, what should you do?', '[{"text":"Send it immediately while the frustration is fresh so your feelings are clear"},{"text":"Wait at least a few hours, reread the email with fresh eyes, remove any emotional language, and focus on facts and solutions"},{"text":"Delete the email and never address the issue"},{"text":"Forward the email to your manager to let them handle it"}]'::jsonb, 1, 'Emotional Intelligence', 'easy', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s59', 'You are assigned to lead a project with team members who are all more experienced than you. What is the best approach?', '[{"text":"Pretend you know more than you do to maintain authority"},{"text":"Acknowledge their expertise openly, leverage their strengths in your planning, facilitate collaboration, and focus on adding value through organization and coordination"},{"text":"Defer all decisions to the most experienced person"},{"text":"Request to be removed from the leadership role"}]'::jsonb, 1, 'Leadership', 'hard', 'assessment', 'soft', NULL, true, now());

INSERT INTO questions VALUES ('s60', 'Your project deadline has been moved up by two weeks with no reduction in scope. What is the most effective response?', '[{"text":"Agree without objection and plan to work overtime every day"},{"text":"Refuse the new deadline outright"},{"text":"Assess the impact, identify which deliverables are critical, communicate trade-offs clearly to stakeholders, and propose a realistic plan that may include phased delivery"},{"text":"Cut quality across all deliverables to meet the new date"}]'::jsonb, 2, 'Adaptability', 'hard', 'assessment', 'soft', NULL, true, now());

-- ============================================================
-- INTERVIEW TECHNICAL QUESTIONS (question_type='interview', category='technical')
-- ============================================================

INSERT INTO questions VALUES ('it1', 'Explain the difference between a stack and a queue. Give a real-world example of each.', NULL, NULL, 'Data Structures', 'medium', 'interview', 'technical', 'Stack: LIFO principle (undo operations, browser back button). Queue: FIFO principle (printer queue, customer service line). Clear distinction between access patterns.', true, now());

INSERT INTO questions VALUES ('it2', 'What is an API and how would you explain it to a non-technical person?', NULL, NULL, 'Web Development', 'easy', 'interview', 'technical', 'API is an interface for software communication. Analogy like waiter in restaurant (takes order, delivers food). Mention request/response, endpoints.', true, now());

INSERT INTO questions VALUES ('it3', 'Describe the software development lifecycle. What phases are typically involved?', NULL, NULL, 'Software Engineering', 'medium', 'interview', 'technical', 'Requirements gathering, design, implementation, testing, deployment, maintenance. Mention methodologies like Agile or Waterfall.', true, now());

INSERT INTO questions VALUES ('it4', 'What are the key differences between SQL and NoSQL databases? When would you use each?', NULL, NULL, 'Database', 'medium', 'interview', 'technical', 'SQL: structured, relational, ACID compliance. NoSQL: flexible schema, horizontal scaling. Use cases for each. Examples.', true, now());

INSERT INTO questions VALUES ('it5', 'How would you ensure the security of a web application?', NULL, NULL, 'Security', 'hard', 'interview', 'technical', 'Input validation, authentication, HTTPS, SQL injection prevention, CSRF protection, encryption, regular updates, access control.', true, now());

INSERT INTO questions VALUES ('it6', 'What is the difference between front-end and back-end development? How do they work together?', NULL, NULL, 'Web Development', 'easy', 'interview', 'technical', 'Front-end: user interface, HTML/CSS/JS, runs in browser. Back-end: server logic, databases, APIs. They communicate via HTTP requests. Full-stack combines both.', true, now());

INSERT INTO questions VALUES ('it7', 'Explain what version control is and why it is important in software development.', NULL, NULL, 'Software Engineering', 'easy', 'interview', 'technical', 'Tracking changes to code over time. Collaboration without conflicts. Git as example. Branches, commits, merges. Rollback capability. Code review through pull requests.', true, now());

INSERT INTO questions VALUES ('it8', 'What is cloud computing? Explain the difference between IaaS, PaaS, and SaaS.', NULL, NULL, 'Cloud Computing', 'hard', 'interview', 'technical', 'On-demand computing resources over internet. IaaS: virtual machines (AWS EC2). PaaS: platform for building apps (Heroku). SaaS: ready-to-use software (Gmail). Scalability, cost benefits.', true, now());

INSERT INTO questions VALUES ('it9', 'How would you approach debugging a program that is not producing the expected output?', NULL, NULL, 'Problem Solving', 'medium', 'interview', 'technical', 'Reproduce the bug. Read error messages. Use print statements or debugger. Check recent changes. Isolate the problem. Test fix. Document the issue.', true, now());

INSERT INTO questions VALUES ('it10', 'What is the difference between authentication and authorization? Give examples.', NULL, NULL, 'Security', 'medium', 'interview', 'technical', 'Authentication: verifying identity (login, password, biometrics). Authorization: verifying permissions (admin vs user roles, access control). Authentication comes first.', true, now());

INSERT INTO questions VALUES ('it11', 'Explain the concept of database normalization. What are the first three normal forms?', NULL, NULL, 'Database', 'hard', 'interview', 'technical', '1NF: atomic values, no repeating groups. 2NF: meets 1NF and all non-key attributes fully depend on the primary key. 3NF: meets 2NF and no transitive dependencies. Purpose: reduce redundancy, improve data integrity.', true, now());

INSERT INTO questions VALUES ('it12', 'What is the difference between monolithic and microservices architecture? What are the trade-offs?', NULL, NULL, 'Software Engineering', 'hard', 'interview', 'technical', 'Monolithic: single deployable unit, simpler to develop initially, harder to scale. Microservices: independent services, independently deployable, better scalability, but more complex infrastructure.', true, now());

INSERT INTO questions VALUES ('it13', 'What are design patterns? Can you explain the Observer pattern with an example?', NULL, NULL, 'Programming Concepts', 'medium', 'interview', 'technical', 'Design patterns are reusable solutions to common software problems. Observer: one-to-many dependency where when one object changes state, all dependents are notified. Example: event listeners in UI, pub/sub systems.', true, now());

INSERT INTO questions VALUES ('it14', 'How does garbage collection work in programming languages? Why is it important?', NULL, NULL, 'Programming Concepts', 'medium', 'interview', 'technical', 'Automatic memory management that reclaims memory occupied by objects no longer in use. Prevents memory leaks. Techniques: reference counting, mark-and-sweep.', true, now());

INSERT INTO questions VALUES ('it15', 'Explain what a container is (e.g., Docker) and how it differs from a virtual machine.', NULL, NULL, 'DevOps', 'hard', 'interview', 'technical', 'Containers share the host OS kernel, are lightweight, start quickly. VMs include a full OS, are heavier, provide stronger isolation. Docker packages applications with dependencies.', true, now());

INSERT INTO questions VALUES ('it16', 'What is responsive web design and how do you implement it?', NULL, NULL, 'Web Development', 'easy', 'interview', 'technical', 'Designing websites that adapt to different screen sizes and devices. Techniques: CSS media queries, flexible grid layouts, relative units, flexible images, mobile-first approach.', true, now());

INSERT INTO questions VALUES ('it17', 'Explain the difference between synchronous and asynchronous programming. Give examples of when to use each.', NULL, NULL, 'Programming Concepts', 'medium', 'interview', 'technical', 'Synchronous: code executes sequentially. Asynchronous: operations can proceed without waiting, uses callbacks, promises, async/await. Async for: API calls, file I/O, database queries.', true, now());

INSERT INTO questions VALUES ('it18', 'What is SQL injection and how do you prevent it?', NULL, NULL, 'Security', 'medium', 'interview', 'technical', 'SQL injection: inserting malicious SQL through user input to manipulate database queries. Prevention: parameterized queries/prepared statements, input validation, ORM usage.', true, now());

INSERT INTO questions VALUES ('it19', 'What is Big O notation and why is it important in software development?', NULL, NULL, 'Algorithms', 'medium', 'interview', 'technical', 'Big O describes the upper bound of algorithm time/space complexity as input grows. Common complexities: O(1), O(log n), O(n), O(n log n), O(n squared). Helps compare algorithm efficiency.', true, now());

INSERT INTO questions VALUES ('it20', 'Describe the MVC (Model-View-Controller) pattern. Why is it widely used in web development?', NULL, NULL, 'Web Development', 'medium', 'interview', 'technical', 'Model: data and business logic. View: user interface presentation. Controller: handles user input, updates model, selects view. Separation of concerns, easier maintenance.', true, now());

-- ============================================================
-- INTERVIEW BEHAVIORAL QUESTIONS (question_type='interview', category='behavioral')
-- ============================================================

INSERT INTO questions VALUES ('ib1', 'Tell me about a time you had to work with a difficult team member. How did you handle it?', NULL, NULL, 'Teamwork', 'medium', 'interview', 'behavioral', 'STAR method. Specific situation. Actions taken to resolve conflict. Professional approach. Positive outcome or lesson learned.', true, now());

INSERT INTO questions VALUES ('ib2', 'Describe a situation where you had to meet a tight deadline. How did you manage your time?', NULL, NULL, 'Time Management', 'medium', 'interview', 'behavioral', 'Specific example. Prioritization strategy. Communication with stakeholders. Outcome. Time management skills demonstrated.', true, now());

INSERT INTO questions VALUES ('ib3', 'Tell me about a project you are most proud of. What was your role and contribution?', NULL, NULL, 'Achievement', 'easy', 'interview', 'behavioral', 'Specific project details. Clear description of personal contribution. Skills applied. Results and impact. Enthusiasm and passion.', true, now());

INSERT INTO questions VALUES ('ib4', 'Describe a time when you had to learn something new quickly. How did you approach it?', NULL, NULL, 'Adaptability', 'medium', 'interview', 'behavioral', 'Learning strategy. Resources used. Time frame. How knowledge was applied. Growth mindset demonstrated.', true, now());

INSERT INTO questions VALUES ('ib5', 'Have you ever made a significant mistake at work or in a project? What did you learn from it?', NULL, NULL, 'Accountability', 'medium', 'interview', 'behavioral', 'Honest about mistake. Accountability. Steps taken to fix it. Lessons learned. How it improved future work.', true, now());

INSERT INTO questions VALUES ('ib6', 'Tell me about a time you had to persuade someone to see things your way.', NULL, NULL, 'Communication', 'medium', 'interview', 'behavioral', 'STAR method. Context of disagreement. How you presented your case. Use of data or examples. Respectful communication.', true, now());

INSERT INTO questions VALUES ('ib7', 'Describe a situation where you took initiative without being asked.', NULL, NULL, 'Leadership', 'medium', 'interview', 'behavioral', 'Identified a problem or opportunity. Took proactive action. Demonstrated leadership. Positive impact on team or project.', true, now());

INSERT INTO questions VALUES ('ib8', 'Tell me about a time when you received negative feedback. How did you respond?', NULL, NULL, 'Emotional Intelligence', 'medium', 'interview', 'behavioral', 'Specific feedback received. Initial reaction managed professionally. Steps taken to improve. Growth demonstrated.', true, now());

INSERT INTO questions VALUES ('ib9', 'Describe a time when you had to juggle multiple responsibilities. How did you prioritize?', NULL, NULL, 'Time Management', 'medium', 'interview', 'behavioral', 'Multiple tasks or roles. Method for prioritization. Communication about capacity. Successful outcome.', true, now());

INSERT INTO questions VALUES ('ib10', 'Tell me about a time you helped a struggling team member succeed.', NULL, NULL, 'Teamwork', 'easy', 'interview', 'behavioral', 'Noticed someone needed help. Offered support without being condescending. Shared knowledge or resources. Positive outcome.', true, now());

INSERT INTO questions VALUES ('ib11', 'Tell me about a time when you had to adapt to a major change at work or in a project. How did you handle it?', NULL, NULL, 'Adaptability', 'medium', 'interview', 'behavioral', 'STAR method. Describe the change clearly. Show emotional maturity in accepting the change. Concrete steps taken to adapt. Positive outcome or growth.', true, now());

INSERT INTO questions VALUES ('ib12', 'Describe a situation where you had to communicate a complex idea to someone who did not have technical knowledge.', NULL, NULL, 'Communication', 'medium', 'interview', 'behavioral', 'STAR method. Specific context. Simplification techniques used (analogies, visuals). Confirmed understanding. Outcome of the communication.', true, now());

INSERT INTO questions VALUES ('ib13', 'Tell me about a time when you disagreed with your manager or supervisor. What did you do?', NULL, NULL, 'Conflict Resolution', 'hard', 'interview', 'behavioral', 'STAR method. Approached respectfully with data and reasoning. Listened to the other perspective. Professional resolution. Shows courage and diplomacy.', true, now());

INSERT INTO questions VALUES ('ib14', 'Give an example of a goal you set and how you achieved it.', NULL, NULL, 'Achievement', 'easy', 'interview', 'behavioral', 'STAR method. Clear, specific goal (SMART criteria). Steps planned and taken. Obstacles faced and overcome. Measurable result.', true, now());

INSERT INTO questions VALUES ('ib15', 'Describe a time when you had to work under significant pressure. How did you maintain your performance?', NULL, NULL, 'Stress Management', 'medium', 'interview', 'behavioral', 'STAR method. Specific high-pressure situation. Strategies used. Communication with stakeholders. Quality maintained.', true, now());

INSERT INTO questions VALUES ('ib16', 'Tell me about a time you failed to meet a deadline or a commitment. What happened and what did you learn?', NULL, NULL, 'Accountability', 'hard', 'interview', 'behavioral', 'STAR method. Honest acknowledgment. Explanation without excuses. How they communicated the delay. Concrete lessons learned. Accountability.', true, now());

INSERT INTO questions VALUES ('ib17', 'Describe a situation where you had to build a relationship with someone you initially did not get along with.', NULL, NULL, 'Relationship Building', 'medium', 'interview', 'behavioral', 'STAR method. Initial difficulty and why. Efforts made to understand the other person. Finding common ground. Professional outcome.', true, now());

INSERT INTO questions VALUES ('ib18', 'Give an example of when you went above and beyond what was expected of you.', NULL, NULL, 'Initiative', 'easy', 'interview', 'behavioral', 'STAR method. Clear description of expectations. What additional actions were taken. Motivation behind going above and beyond. Positive impact.', true, now());

INSERT INTO questions VALUES ('ib19', 'Tell me about a time when you had to make a decision with incomplete information. How did you approach it?', NULL, NULL, 'Decision Making', 'hard', 'interview', 'behavioral', 'STAR method. Context and why information was incomplete. How they gathered what was available. Risk assessment. Decision-making framework. Outcome.', true, now());

INSERT INTO questions VALUES ('ib20', 'Describe a time when you had to give someone difficult feedback. How did you handle it?', NULL, NULL, 'Communication', 'medium', 'interview', 'behavioral', 'STAR method. Context. Preparation and approach (private setting, specific examples). Balanced positive and negative. Followed up to support improvement.', true, now());

-- ============================================================
-- INTERVIEW HR QUESTIONS (question_type='interview', category='hr')
-- ============================================================

INSERT INTO questions VALUES ('ih1', 'Why should we hire you? What makes you a good fit for this position?', NULL, NULL, 'Self-Presentation', 'medium', 'interview', 'hr', 'Relevant skills and experience. Enthusiasm for the role. Understanding of company needs. Unique value proposition.', true, now());

INSERT INTO questions VALUES ('ih2', 'Where do you see yourself in five years?', NULL, NULL, 'Career Goals', 'easy', 'interview', 'hr', 'Career growth goals. Alignment with industry/company direction. Realistic expectations. Ambition balanced with commitment.', true, now());

INSERT INTO questions VALUES ('ih3', 'What are your greatest strengths and weaknesses?', NULL, NULL, 'Self-Assessment', 'medium', 'interview', 'hr', 'Honest self-assessment. Strengths relevant to role. Weakness that shows self-awareness. Steps being taken to improve.', true, now());

INSERT INTO questions VALUES ('ih4', 'Why are you interested in this field? What motivated you to pursue this career?', NULL, NULL, 'Motivation', 'easy', 'interview', 'hr', 'Genuine passion. Specific interests. How education/experience relates. Long-term career motivation.', true, now());

INSERT INTO questions VALUES ('ih5', 'How do you handle working under pressure or stressful situations?', NULL, NULL, 'Stress Management', 'medium', 'interview', 'hr', 'Specific strategies. Examples of past pressure situations. Prioritization approach. Maintaining quality under stress.', true, now());

INSERT INTO questions VALUES ('ih6', 'Tell me about yourself.', NULL, NULL, 'Self-Presentation', 'easy', 'interview', 'hr', 'Brief professional background. Key skills and experiences. Current situation. Why you are here today. Forward-looking statement.', true, now());

INSERT INTO questions VALUES ('ih7', 'What is your expected salary range for this position?', NULL, NULL, 'Negotiation', 'hard', 'interview', 'hr', 'Research-based answer. Market rate awareness. Flexibility. Focus on value provided.', true, now());

INSERT INTO questions VALUES ('ih8', 'Why did you choose your major or field of study?', NULL, NULL, 'Motivation', 'easy', 'interview', 'hr', 'Personal interest or passion. Career relevance. Specific experiences that influenced decision.', true, now());

INSERT INTO questions VALUES ('ih9', 'What do you know about our company, and why do you want to work here?', NULL, NULL, 'Company Research', 'medium', 'interview', 'hr', 'Company research demonstrated. Specific aspects that attract you. How your values align. Genuine interest.', true, now());

INSERT INTO questions VALUES ('ih10', 'How do you stay current with new developments and trends in your field?', NULL, NULL, 'Continuous Learning', 'easy', 'interview', 'hr', 'Specific resources. Community involvement. Continuous learning mindset. Examples of recently learned skills.', true, now());

INSERT INTO questions VALUES ('ih11', 'What type of work environment do you thrive in?', NULL, NULL, 'Self-Awareness', 'easy', 'interview', 'hr', 'Self-awareness about preferences. Honest answer that aligns with company culture. Examples of thriving in past environments.', true, now());

INSERT INTO questions VALUES ('ih12', 'Describe your ideal manager. What management style works best for you?', NULL, NULL, 'Self-Awareness', 'medium', 'interview', 'hr', 'Thoughtful answer showing self-awareness. Preference for guidance vs autonomy. Appreciation for feedback. Not negative about past managers.', true, now());

INSERT INTO questions VALUES ('ih13', 'Why are you leaving (or why did you leave) your current/previous position?', NULL, NULL, 'Career Transition', 'hard', 'interview', 'hr', 'Positive framing focused on growth. No badmouthing of previous employer. Focus on what they are looking for.', true, now());

INSERT INTO questions VALUES ('ih14', 'How do you handle disagreements or conflicts with coworkers?', NULL, NULL, 'Conflict Resolution', 'medium', 'interview', 'hr', 'Calm and professional approach. Direct but respectful communication. Focus on the issue, not the person. Willingness to compromise.', true, now());

INSERT INTO questions VALUES ('ih15', 'What accomplishment are you most proud of in your career or education so far?', NULL, NULL, 'Achievement', 'easy', 'interview', 'hr', 'Specific accomplishment with context. Clear personal contribution. Skills demonstrated. Measurable results or impact.', true, now());

INSERT INTO questions VALUES ('ih16', 'How do you prioritize your work when everything seems urgent?', NULL, NULL, 'Time Management', 'medium', 'interview', 'hr', 'Structured approach (importance vs urgency). Communication with stakeholders. Ability to say no or negotiate timelines.', true, now());

INSERT INTO questions VALUES ('ih17', 'What questions do you have for us?', NULL, NULL, 'Engagement', 'medium', 'interview', 'hr', 'Prepared thoughtful questions. Questions about team, culture, growth. Shows genuine interest. Not focused solely on salary.', true, now());

INSERT INTO questions VALUES ('ih18', 'Do you prefer working independently or as part of a team?', NULL, NULL, 'Work Style', 'easy', 'interview', 'hr', 'Balanced answer showing ability to do both. Examples of success in both settings. Shows flexibility.', true, now());

INSERT INTO questions VALUES ('ih19', 'Where do you think this industry is heading in the next few years, and how are you preparing for it?', NULL, NULL, 'Industry Awareness', 'hard', 'interview', 'hr', 'Awareness of current trends. Thoughtful analysis. Personal steps to stay relevant. Shows forward-thinking.', true, now());

INSERT INTO questions VALUES ('ih20', 'If you could change one thing about your career path so far, what would it be and why?', NULL, NULL, 'Self-Reflection', 'medium', 'interview', 'hr', 'Honest and reflective. Shows self-awareness and growth mindset. Explains what they would have done differently. Not negative.', true, now());


-- ============================================================================
-- 10. SEED — TRAINING RESOURCES (~70 resources for the catalog)
-- ============================================================================

INSERT INTO training_resources (skill_name, skill_category, resource_name, resource_type, format, platform, duration, url) VALUES
('Database','technical','SQL Full Course for Beginners','study','video','YouTube - freeCodeCamp','4.5 hours','https://www.youtube.com/watch?v=HXV3zeQKqGY'),
('Database','technical','SQLBolt - Interactive SQL Lessons','practice','practice','SQLBolt','Self-paced','https://sqlbolt.com/'),
('Database','technical','Database Normalization (1NF, 2NF, 3NF, BCNF)','study','article','GeeksforGeeks','15 min read','https://www.geeksforgeeks.org/normal-forms-in-dbms/'),
('Database','technical','SQL Practice Problems on HackerRank','practice','practice','HackerRank','Self-paced','https://www.hackerrank.com/domains/sql'),
('Database','technical','Databases: Relational Databases and SQL','study','course','edX - Stanford','2 weeks','https://www.edx.org/learn/relational-databases/stanford-university-databases-relational-databases-and-sql'),
('Database','technical','Learn SQL - Codecademy','practice','course','Codecademy','8 hours','https://www.codecademy.com/learn/learn-sql');

-- Web Development
INSERT INTO training_resources (skill_name, skill_category, resource_name, resource_type, format, platform, duration, url) VALUES
('Web Development','technical','Responsive Web Design Certification','study','course','freeCodeCamp','300 hours','https://www.freecodecamp.org/learn/2022/responsive-web-design/'),
('Web Development','technical','HTML & CSS Full Course for Beginners','study','video','YouTube - Traversy Media','2 hours','https://www.youtube.com/watch?v=mU6anWqZJcc'),
('Web Development','technical','MDN Web Docs - Getting Started with the Web','study','article','MDN Web Docs','30 min read','https://developer.mozilla.org/en-US/docs/Learn/Getting_started_with_the_web'),
('Web Development','technical','JavaScript Algorithms and Data Structures','study','course','freeCodeCamp','300 hours','https://www.freecodecamp.org/learn/javascript-algorithms-and-data-structures/'),
('Web Development','technical','Build Your First Website - HTML & CSS','practice','course','Codecademy','10 hours','https://www.codecademy.com/learn/learn-html'),
('Web Development','technical','REST API Concepts and Examples','study','video','YouTube - WebConcepts','8 min','https://www.youtube.com/watch?v=7YcW25PHnAA');

-- Programming Concepts
INSERT INTO training_resources (skill_name, skill_category, resource_name, resource_type, format, platform, duration, url) VALUES
('Programming Concepts','technical','Object-Oriented Programming in 7 Minutes','study','video','YouTube - Programming with Mosh','1 hour','https://www.youtube.com/watch?v=pTB0EiLXUC8'),
('Programming Concepts','technical','Design Patterns in Plain English','study','article','Refactoring Guru','20 min read','https://refactoring.guru/design-patterns'),
('Programming Concepts','technical','Practice OOP Exercises on Exercism','practice','practice','Exercism','Self-paced','https://exercism.org/'),
('Programming Concepts','technical','CS50 Introduction to Computer Science','study','course','Harvard / edX','12 weeks','https://cs50.harvard.edu/x/'),
('Programming Concepts','technical','Programming Fundamentals - Python','study','video','YouTube - CS Dojo','30 min','https://www.youtube.com/watch?v=Z1Yd7upQsXY'),
('Programming Concepts','technical','Learn Python 3 - Codecademy','practice','course','Codecademy','25 hours','https://www.codecademy.com/learn/learn-python-3');

-- Data Structures
INSERT INTO training_resources (skill_name, skill_category, resource_name, resource_type, format, platform, duration, url) VALUES
('Data Structures','technical','Data Structures Full Course for Beginners','study','video','YouTube - freeCodeCamp','8 hours','https://www.youtube.com/watch?v=RBSGKlAvoiM'),
('Data Structures','technical','VisuAlgo - Data Structure Visualizations','practice','practice','VisuAlgo','Self-paced','https://visualgo.net/'),
('Data Structures','technical','Data Structures Overview - GeeksforGeeks','study','article','GeeksforGeeks','20 min read','https://www.geeksforgeeks.org/data-structures/'),
('Data Structures','technical','Data Structures Practice - HackerRank','practice','practice','HackerRank','Self-paced','https://www.hackerrank.com/domains/data-structures'),
('Data Structures','technical','Data Structures Explained - CS Dojo','study','video','YouTube - CS Dojo','20 min','https://www.youtube.com/watch?v=bum_19loj9A'),
('Data Structures','technical','Khan Academy - Algorithms (includes DS)','study','course','Khan Academy','Self-paced','https://www.khanacademy.org/computing/computer-science/algorithms');

-- Algorithms
INSERT INTO training_resources (skill_name, skill_category, resource_name, resource_type, format, platform, duration, url) VALUES
('Algorithms','technical','Algorithms and Data Structures Tutorial','study','video','YouTube - freeCodeCamp','5 hours','https://www.youtube.com/watch?v=8hly31xKli0'),
('Algorithms','technical','Big O Notation Explained','study','article','freeCodeCamp','10 min read','https://www.freecodecamp.org/news/big-o-notation-why-it-matters-and-why-it-doesnt-1674cfa8a23c/'),
('Algorithms','technical','LeetCode - Practice Coding Challenges','practice','practice','LeetCode','Self-paced','https://leetcode.com/problemset/all/'),
('Algorithms','technical','Sorting Algorithms Visualized and Explained','study','video','YouTube - CS Dojo','15 min','https://www.youtube.com/watch?v=pkkFqlG0Hds'),
('Algorithms','technical','Khan Academy - Algorithms Course','study','course','Khan Academy','Self-paced','https://www.khanacademy.org/computing/computer-science/algorithms'),
('Algorithms','technical','HackerRank Algorithms Practice','practice','practice','HackerRank','Self-paced','https://www.hackerrank.com/domains/algorithms');

-- Networking
INSERT INTO training_resources (skill_name, skill_category, resource_name, resource_type, format, platform, duration, url) VALUES
('Networking','technical','Computer Networking Full Course','study','video','YouTube - NetworkChuck','6 hours','https://www.youtube.com/watch?v=qiQR5rTSshw'),
('Networking','technical','HTTP Overview - MDN Web Docs','study','article','MDN Web Docs','12 min read','https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview'),
('Networking','technical','The Bits and Bytes of Computer Networking','study','course','Coursera - Google','25 hours','https://www.coursera.org/learn/computer-networking'),
('Networking','technical','Networking Fundamentals','study','video','YouTube - NetworkChuck','45 min','https://www.youtube.com/watch?v=cNwEVYkx2Kk'),
('Networking','technical','TCP/IP and Subnet Masking Explained','study','article','GeeksforGeeks','15 min read','https://www.geeksforgeeks.org/tcp-ip-model/'),
('Networking','technical','Network Security Fundamentals','study','course','Coursera','15 hours','https://www.coursera.org/learn/network-security');

-- Software Engineering
INSERT INTO training_resources (skill_name, skill_category, resource_name, resource_type, format, platform, duration, url) VALUES
('Software Engineering','technical','Software Development Life Cycle (SDLC)','study','video','YouTube - Simplilearn','20 min','https://www.youtube.com/watch?v=Fi3_BjVzpqk'),
('Software Engineering','technical','Agile Methodology Explained','study','article','Atlassian','10 min read','https://www.atlassian.com/agile'),
('Software Engineering','technical','Git & GitHub Crash Course for Beginners','practice','video','YouTube - Traversy Media','30 min','https://www.youtube.com/watch?v=SWYqp7iY_Tc'),
('Software Engineering','technical','Software Engineering Essentials','study','course','edX - TUM','6 weeks','https://www.edx.org/learn/software-engineering/technische-universitat-munchen-software-engineering-essentials'),
('Software Engineering','technical','Introduction to Software Testing','study','article','GeeksforGeeks','15 min read','https://www.geeksforgeeks.org/software-testing-basics/'),
('Software Engineering','technical','Learn Git Branching - Interactive Tutorial','practice','practice','learngitbranching.js.org','Self-paced','https://learngitbranching.js.org/');

-- Operating Systems
INSERT INTO training_resources (skill_name, skill_category, resource_name, resource_type, format, platform, duration, url) VALUES
('Operating Systems','technical','Operating Systems Full Course','study','video','YouTube - freeCodeCamp','3.5 hours','https://www.youtube.com/watch?v=26QPDBe-NB8'),
('Operating Systems','technical','Introduction to Operating Systems','study','course','Coursera - Google','30 hours','https://www.coursera.org/learn/os-power-user'),
('Operating Systems','technical','Process Scheduling in OS','study','article','GeeksforGeeks','15 min read','https://www.geeksforgeeks.org/cpu-scheduling-in-operating-systems/'),
('Operating Systems','technical','Linux Command Line Basics','practice','video','YouTube - NetworkChuck','20 min','https://www.youtube.com/watch?v=ZtqBQ68cfJc'),
('Operating Systems','technical','Memory Management in OS','study','article','GeeksforGeeks','12 min read','https://www.geeksforgeeks.org/memory-management-in-operating-system/'),
('Operating Systems','technical','Exercism - Shell Track','practice','practice','Exercism','Self-paced','https://exercism.org/tracks/bash');

-- Security / Cybersecurity
INSERT INTO training_resources (skill_name, skill_category, resource_name, resource_type, format, platform, duration, url) VALUES
('Security','technical','Cybersecurity for Beginners - Full Course','study','video','YouTube - freeCodeCamp','5 hours','https://www.youtube.com/watch?v=U_P23SqJaDc'),
('Security','technical','Introduction to Cybersecurity','study','course','Coursera - NYU','15 hours','https://www.coursera.org/learn/intro-cyber-security'),
('Security','technical','OWASP Top 10 Explained','study','article','GeeksforGeeks','15 min read','https://www.geeksforgeeks.org/owasp-top-10-vulnerabilities-and-prevention/'),
('Security','technical','Ethical Hacking for Beginners','study','video','YouTube - NetworkChuck','30 min','https://www.youtube.com/watch?v=fNzpcB7ODxQ'),
('Security','technical','HackerRank - Security Practice','practice','practice','HackerRank','Self-paced','https://www.hackerrank.com/domains/security'),
('Cybersecurity','technical','Cybersecurity for Beginners - Full Course','study','video','YouTube - freeCodeCamp','5 hours','https://www.youtube.com/watch?v=U_P23SqJaDc'),
('Cybersecurity','technical','OWASP Top 10 Explained','study','article','GeeksforGeeks','15 min read','https://www.geeksforgeeks.org/owasp-top-10-vulnerabilities-and-prevention/'),
('Cybersecurity','technical','Ethical Hacking for Beginners','study','video','YouTube - NetworkChuck','30 min','https://www.youtube.com/watch?v=fNzpcB7ODxQ');

-- ---------- Soft Skills ----------

-- Communication
INSERT INTO training_resources (skill_name, skill_category, resource_name, resource_type, format, platform, duration, url) VALUES
('Communication','soft','Improve Your Communication Skills','study','course','Coursera - University of Pennsylvania','10 hours','https://www.coursera.org/learn/wharton-communication-skills'),
('Communication','soft','How to Speak So People Want to Listen','study','video','YouTube - TEDx (Julian Treasure)','10 min','https://www.youtube.com/watch?v=eIho2S0ZahI'),
('Communication','soft','Communication Skills for University Success','study','course','Coursera - University of Sydney','10 hours','https://www.coursera.org/learn/communication-skills'),
('Communication','soft','Active Listening: The Key to Great Communication','study','article','MindTools','8 min read','https://www.mindtools.com/az4wxv7/active-listening'),
('Communication','soft','Presentation Skills for Beginners','study','video','YouTube - Traversy Media','20 min','https://www.youtube.com/watch?v=HAnw168huqA');

-- Teamwork
INSERT INTO training_resources (skill_name, skill_category, resource_name, resource_type, format, platform, duration, url) VALUES
('Teamwork','soft','Teamwork Skills: Communicating Effectively in Groups','study','course','Coursera - University of Colorado','8 hours','https://www.coursera.org/learn/teamwork-skills-effective-communication'),
('Teamwork','soft','How to Give Constructive Feedback','study','article','Harvard Business Review','8 min read','https://hbr.org/2019/03/the-feedback-fallacy'),
('Teamwork','soft','Collaboration and Emotional Intelligence','study','video','YouTube - TEDx','12 min','https://www.youtube.com/watch?v=qp0HIF3SfI4'),
('Teamwork','soft','Working in Teams: A Practical Guide','study','article','MindTools','10 min read','https://www.mindtools.com/awe2wte/team-building'),
('Teamwork','soft','High Performance Collaboration','study','course','Coursera - Northwestern','8 hours','https://www.coursera.org/learn/leadership-collaboration');

-- Leadership
INSERT INTO training_resources (skill_name, skill_category, resource_name, resource_type, format, platform, duration, url) VALUES
('Leadership','soft','Foundations of Everyday Leadership','study','course','Coursera - University of Illinois','6 hours','https://www.coursera.org/learn/everyday-leadership-foundation'),
('Leadership','soft','Leadership Styles Explained','study','video','YouTube - Sprouts','7 min','https://www.youtube.com/watch?v=VuSbCSmBb50'),
('Leadership','soft','How Great Leaders Inspire Action','study','video','YouTube - TED (Simon Sinek)','18 min','https://www.youtube.com/watch?v=qp0HIF3SfI4'),
('Leadership','soft','Leading People and Teams','study','course','Coursera - University of Michigan','20 hours','https://www.coursera.org/specializations/leading-people-teams'),
('Leadership','soft','Decision Making Frameworks','study','article','MindTools','10 min read','https://www.mindtools.com/a9m17ht/decision-making');

-- Problem Solving
INSERT INTO training_resources (skill_name, skill_category, resource_name, resource_type, format, platform, duration, url) VALUES
('Problem Solving','soft','Creative Problem Solving','study','course','Coursera - University of Minnesota','10 hours','https://www.coursera.org/learn/creative-problem-solving'),
('Problem Solving','soft','How to Solve Any Problem - Design Thinking','study','video','YouTube - NNGroup','12 min','https://www.youtube.com/watch?v=_r0VX-aU_T8'),
('Problem Solving','soft','Root Cause Analysis Techniques','study','article','MindTools','10 min read','https://www.mindtools.com/a3g5cdi/root-cause-analysis'),
('Problem Solving','soft','Critical Thinking & Problem Solving','study','course','edX - RIT','5 weeks','https://www.edx.org/learn/critical-thinking/rochester-institute-of-technology-critical-thinking-problem-solving'),
('Problem Solving','soft','Think Like a Programmer - Problem Solving','study','video','YouTube - CS Dojo','10 min','https://www.youtube.com/watch?v=azcrPFhaY9k');

-- Time Management
INSERT INTO training_resources (skill_name, skill_category, resource_name, resource_type, format, platform, duration, url) VALUES
('Time Management','soft','Work Smarter, Not Harder: Time Management','study','course','Coursera - UC Irvine','6 hours','https://www.coursera.org/learn/work-smarter-not-harder'),
('Time Management','soft','Eisenhower Matrix Explained','study','article','Todoist','8 min read','https://todoist.com/productivity-methods/eisenhower-matrix'),
('Time Management','soft','How to Manage Your Time Better','study','video','YouTube - TEDx','12 min','https://www.youtube.com/watch?v=iONDebHX9qk'),
('Time Management','soft','Pomodoro Technique for Students','study','article','Todoist','6 min read','https://todoist.com/productivity-methods/pomodoro-technique'),
('Time Management','soft','Learning How to Learn','study','course','Coursera - McMaster University','15 hours','https://www.coursera.org/learn/learning-how-to-learn');

-- Emotional Intelligence
INSERT INTO training_resources (skill_name, skill_category, resource_name, resource_type, format, platform, duration, url) VALUES
('Emotional Intelligence','soft','Empathy and Emotional Intelligence at Work','study','course','edX - UC Berkeley','5 weeks','https://www.edx.org/course/empathy-and-emotional-intelligence-at-work'),
('Emotional Intelligence','soft','Developing Emotional Intelligence','study','video','YouTube - TEDx','15 min','https://www.youtube.com/watch?v=D6_J7FfgWVc'),
('Emotional Intelligence','soft','What Is Emotional Intelligence?','study','article','MindTools','10 min read','https://www.mindtools.com/a47iw1o/emotional-intelligence'),
('Emotional Intelligence','soft','Inspiring Leadership through Emotional Intelligence','study','course','Coursera - Case Western Reserve','8 weeks','https://www.coursera.org/learn/emotional-intelligence-leadership'),
('Emotional Intelligence','soft','Emotional Intelligence at Work - TEDx','study','video','YouTube - TEDx','14 min','https://www.youtube.com/watch?v=wJhfKYzKc0s');

-- Conflict Resolution
INSERT INTO training_resources (skill_name, skill_category, resource_name, resource_type, format, platform, duration, url) VALUES
('Conflict Resolution','soft','Conflict Management Specialization','study','course','Coursera - UC Irvine','20 hours','https://www.coursera.org/specializations/conflict-management'),
('Conflict Resolution','soft','Resolving Conflict at Work','study','article','MindTools','10 min read','https://www.mindtools.com/pages/article/newLDR_81.htm'),
('Conflict Resolution','soft','How to Deal with Conflict','study','video','YouTube - TEDx','15 min','https://www.youtube.com/watch?v=CnYmSO3KOFA'),
('Conflict Resolution','soft','Negotiation, Mediation, and Conflict Resolution','study','course','Coursera - ESSEC','12 hours','https://www.coursera.org/learn/negotiation-mediation-conflict-resolution');

-- Adaptability
INSERT INTO training_resources (skill_name, skill_category, resource_name, resource_type, format, platform, duration, url) VALUES
('Adaptability','soft','Adaptability and Resiliency','study','course','Coursera - University of California','6 hours','https://www.coursera.org/learn/adaptability-and-resiliency'),
('Adaptability','soft','How to Be More Adaptable at Work','study','article','MindTools','8 min read','https://www.mindtools.com/abjp91f/adaptability'),
('Adaptability','soft','The Secret to Adapting to Change','study','video','YouTube - TEDx','12 min','https://www.youtube.com/watch?v=4p1jG2QwNIg'),
('Adaptability','soft','Growth Mindset - Carol Dweck','study','video','YouTube - TEDx','10 min','https://www.youtube.com/watch?v=hiiEeMN7vbQ');

-- ---------- General (interview prep + career) ----------

-- Interview Prep
INSERT INTO training_resources (skill_name, skill_category, resource_name, resource_type, format, platform, duration, url) VALUES
('Interview Preparation','general','The STAR Method: Complete Interview Guide','study','article','The Muse','10 min read','https://www.themuse.com/advice/star-interview-method'),
('Interview Preparation','general','Interview Tips: How to Answer "Tell Me About Yourself"','study','video','YouTube - Indeed','8 min','https://www.youtube.com/watch?v=es7XtrlsDIQ'),
('Interview Preparation','general','Top 30 Interview Questions and Answers','study','article','Indeed','15 min read','https://www.indeed.com/career-advice/interviewing/top-interview-questions-and-answers'),
('Interview Preparation','general','Complete 3 voice interview simulations','practice','practice','PrepNow','Self-paced',NULL),
('Interview Preparation','general','Body Language Tips for Interviews','study','video','YouTube - Harvard Business Review','6 min','https://www.youtube.com/watch?v=PCWVi5pAa30'),
('Interview Preparation','general','Questions to Ask the Interviewer','study','article','The Balance','8 min read','https://www.thebalancemoney.com/questions-to-ask-in-a-job-interview-2061205');

-- Career Readiness
INSERT INTO training_resources (skill_name, skill_category, resource_name, resource_type, format, platform, duration, url) VALUES
('Career Readiness','general','How to Write a Resume That Stands Out','study','article','Harvard Business Review','12 min read','https://hbr.org/2023/01/how-to-write-a-resume-that-stands-out'),
('Career Readiness','general','LinkedIn Profile Tips for Students','study','article','LinkedIn Blog','10 min read','https://www.linkedin.com/pulse/how-create-great-linkedin-profile-tips-students-new-graduates/'),
('Career Readiness','general','Building a Developer Portfolio','study','video','YouTube - ForrestKnight','15 min','https://www.youtube.com/watch?v=ocdwh0KYeUs'),
('Career Readiness','general','How to Research a Company Before an Interview','study','article','Glassdoor','8 min read','https://www.glassdoor.com/blog/guide/how-to-research-a-company/'),
('Career Readiness','general','Professional Email Writing Course','practice','course','Coursera','4 hours','https://www.coursera.org/learn/professional-emails');


-- ============================================================================
-- 11. VERIFY — should return: 23 skills, 180 active questions, 70+ resources
-- ============================================================================
SELECT
  (SELECT COUNT(*) FROM skills)                                    AS total_skills,
  (SELECT COUNT(*) FROM questions WHERE active = true)             AS total_questions,
  (SELECT COUNT(*) FROM training_resources WHERE active = true)    AS total_resources;

SELECT category, question_type, COUNT(*) AS n
FROM questions
GROUP BY category, question_type
ORDER BY question_type, category;
