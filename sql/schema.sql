CREATE DATABASE IF NOT EXISTS `Tp1GcDataBase`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `Tp1GcDataBase`;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(190) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('gestor', 'funcionario', 'aluno') NOT NULL DEFAULT 'aluno',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS courses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_courses_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS units (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_units_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS study_plan (
    id INT AUTO_INCREMENT PRIMARY KEY,
    course_id INT NOT NULL,
    unit_id INT NOT NULL,
    year_number TINYINT UNSIGNED NOT NULL,
    semester TINYINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_study_plan_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    CONSTRAINT fk_study_plan_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
    UNIQUE KEY uq_study_plan (course_id, unit_id, year_number, semester)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS student_profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    course_id INT NOT NULL,
    full_name VARCHAR(150) DEFAULT '',
    birth_date DATE NULL,
    contact_email VARCHAR(190) DEFAULT '',
    phone VARCHAR(40) DEFAULT '',
    address VARCHAR(255) DEFAULT '',
    photo_path VARCHAR(255) DEFAULT NULL,
    notes TEXT NULL,
    status ENUM('rascunho', 'submetida', 'aprovada', 'rejeitada') NOT NULL DEFAULT 'rascunho',
    review_notes TEXT NULL,
    reviewed_by INT NULL,
    reviewed_at TIMESTAMP NULL DEFAULT NULL,
    submitted_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_student_profiles_user (user_id),
    CONSTRAINT fk_student_profile_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_student_profile_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT,
    CONSTRAINT fk_student_profile_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS deleted_student_profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    original_profile_id INT NOT NULL,
    user_id INT NOT NULL,
    course_id INT NOT NULL,
    full_name VARCHAR(150) DEFAULT '',
    birth_date DATE NULL,
    contact_email VARCHAR(190) DEFAULT '',
    phone VARCHAR(40) DEFAULT '',
    address VARCHAR(255) DEFAULT '',
    photo_path VARCHAR(255) DEFAULT NULL,
    notes TEXT NULL,
    status ENUM('rascunho', 'submetida', 'aprovada', 'rejeitada') NOT NULL DEFAULT 'rascunho',
    review_notes TEXT NULL,
    reviewed_by INT NULL,
    reviewed_at TIMESTAMP NULL DEFAULT NULL,
    submitted_at TIMESTAMP NULL DEFAULT NULL,
    original_created_at DATETIME NULL DEFAULT NULL,
    original_updated_at DATETIME NULL DEFAULT NULL,
    deleted_by INT NULL,
    deleted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    purge_after DATETIME NOT NULL,
    INDEX idx_deleted_student_profiles_purge_after (purge_after)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS student_profile_decisions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_profile_id INT NOT NULL,
    previous_status ENUM('rascunho', 'submetida', 'aprovada', 'rejeitada') NOT NULL,
    new_status ENUM('rascunho', 'submetida', 'aprovada', 'rejeitada') NOT NULL,
    previous_review_notes TEXT NULL,
    new_review_notes TEXT NULL,
    reviewed_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_student_profile_decisions_profile_created (student_profile_id, created_at),
    CONSTRAINT fk_student_profile_decisions_profile FOREIGN KEY (student_profile_id) REFERENCES student_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_student_profile_decisions_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS enrollment_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    course_id INT NOT NULL,
    status ENUM('pendente', 'aprovado', 'rejeitado') NOT NULL DEFAULT 'pendente',
    student_notes TEXT NULL,
    decision_notes TEXT NULL,
    decided_by INT NULL,
    decided_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_enrollment_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_enrollment_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT,
    CONSTRAINT fk_enrollment_decided_by FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS enrollment_request_decisions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    enrollment_request_id INT NOT NULL,
    previous_status ENUM('pendente', 'aprovado', 'rejeitado') NOT NULL,
    new_status ENUM('pendente', 'aprovado', 'rejeitado') NOT NULL,
    previous_decision_notes TEXT NULL,
    new_decision_notes TEXT NULL,
    decided_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_enrollment_request_decisions_request_created (enrollment_request_id, created_at),
    CONSTRAINT fk_enrollment_request_decisions_request FOREIGN KEY (enrollment_request_id) REFERENCES enrollment_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_enrollment_request_decisions_decided_by FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS submission_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_submission_events_user_type_created (user_id, event_type, created_at),
    CONSTRAINT fk_submission_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS grade_sheets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    unit_id INT NOT NULL,
    academic_year VARCHAR(20) NOT NULL,
    season VARCHAR(30) NOT NULL,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_grade_sheets_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
    CONSTRAINT fk_grade_sheets_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    UNIQUE KEY uq_grade_sheets (unit_id, academic_year, season)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS grade_sheet_students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sheet_id INT NOT NULL,
    student_user_id INT NOT NULL,
    final_grade DECIMAL(5,2) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_grade_sheet_students_sheet FOREIGN KEY (sheet_id) REFERENCES grade_sheets(id) ON DELETE CASCADE,
    CONSTRAINT fk_grade_sheet_students_user FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_grade_sheet_students (sheet_id, student_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
