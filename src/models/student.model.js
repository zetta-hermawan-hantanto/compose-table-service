// *************** IMPORT CORE ***************
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const DateOnly = require('../../utils/common-mongoose-dateonly')(mongoose);

// *************** TRANSCRIPT SCHEMA *************** 
const transcriptSchema = new Schema(
  {
    class_id: {
      type: Schema.ObjectId,
      ref: 'class',
    },
    scholar_season_id: {
      type: Schema.ObjectId,
      ref: 'scholar_season',
    },
    allow_final_transcript_gen: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true, _id: false }
);

// *************** TRACK THUMB UPS SCHEMA *************** 
const trackThumbUpSchema = new Schema(
  {
    allow_final_transcript_gen: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true, _id: false }
);

// *************** COMPANY SCHEMA *************** 
const CompanySchema = new Schema(
  {
    // Reference to the company
    company: {
      type: Schema.ObjectId,
      ref: 'companies',
    },
    // Start date of the contract
    start_date: {
      date: {
        type: String,
      },
      time: {
        type: String,
      },
    },
    // End date of the contract
    end_date: {
      date: {
        type: String,
      },
      time: {
        type: String,
      },
    },
    // Minimum number of days the person must spend in the company
    minimum_days_spent: { type: Number, default: 0 },
    // Minimum number of months the person must spend in the company
    minimum_months_spent: { type: Number, default: 0 },
    // Actual number of days the person spent in the company
    actual_days_spent: { type: Number, default: 0 },
    // Actual number of months the person spent in the company
    actual_months_spent: { type: Number, default: 0 },
    // Indicates if the contract is currently active
    is_active: {
      type: Boolean,
      default: true,
    },
    // Status of the contract
    status: {
      type: String,
      enum: ['pending', 'active', 'inactive'],
      default: 'pending',
    },
    // Reference to the mentor assigned to the person
    mentor: {
      type: Schema.ObjectId,
      ref: 'user',
    },
    // Reference to the job description
    job_description_id: { type: Schema.ObjectId, ref: 'job_description' },
    // Reference to the problematic ID
    problematic_id: { type: Schema.ObjectId, ref: 'pb_problematic' },
    // Reference to the mentor's evaluation response
    mentor_evaluation_id: { type: Schema.ObjectId, ref: 'mentor_evaluation_response' },
    // Date when the contract was closed
    contract_closed_date: {
      date: String,
      time: String,
    },
    // Academic professional evaluation details
    academic_pro_evaluation: {
      // Reference to the academic test
      test_id: { type: Schema.ObjectId, ref: 'test' },
      // Status of the evaluation process
      status: { type: String, enum: ['not_sent', 'sent', 'opened', 'resend', 'submitted', 'completed_by_platform'] },
      // Reference to the document used for mark entry
      mark_entry_document: { type: Schema.ObjectId, ref: 'acad_document'},
      // Reference to the test correction
      test_correction_id: { type: Schema.ObjectId, ref: 'test_correction' },
    },
    // Soft skill professional evaluation details
    soft_skill_pro_evaluation: {
      // Reference to the soft skills test
      test_id: { type: Schema.ObjectId, ref: 'test' },
      // Status of the evaluation process
      status: { type: String, enum: ['not_sent', 'sent', 'opened', 'resend', 'submitted', 'completed_by_platform'] },
      // Reference to the document used for mark entry
      mark_entry_document: { type: Schema.ObjectId, ref: 'acad_document'},
      // Reference to the test correction
      test_correction_id: { type: Schema.ObjectId, ref: 'test_correction' },
    },
    // Type of formation
    type_of_formation: {
      type: String,
      enum: [
        'FORMATION_INITIALE_HORS_APPRENTISSAGE',
        'FORMATION_INITIALE_APPRENTISSAGE',
        'FORMATION_CONTINUE_HORS_CONTRAT_DE_PROFESSIONNALISATION',
        'FORMATION_CONTINUE_CONTRAT_DE_PROFESSIONNALISATION',
        'VAE',
        'EQUIVALENCE_DIPLOME_ETRANGER',
        'CANDIDAT_LIBRE',
        null
      ],
    },
    // Category of insertion into the program
    category_insertion: {
      type: String,
      enum: [
        'FORMATION_INITIALE',
        'CONTRAT_DAPPRENTISSAGE',
        'CONTRAT_DE_PROFESSIONNALISATION',
        'STATUT_DE_STAGIAIRE_DE_LA_FORMATION_PROFESSIONNELLE',
        null
      ],
    },
    // Reason for deactivating the contract
    reason_deactivating_contract: {
      type: String,
      default: ''
    }
  },
  {
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

// *************** STUDENT SCHEMA *************** 
const StudentSchema = new Schema(
  {
    // Reference to school
    school: {
      type: Schema.ObjectId,
      ref: 'school',
    },
    // Indicates if the email is incorrect
    incorrect_email: {
      type: Boolean,
      default: false,
    },
    // Reference to RNCP title
    rncp_title: {
      type: Schema.ObjectId,
      ref: 'rncp_title',
    },
    // Reference to scholar season
    scholar_season: {
      type: Schema.ObjectId,
      ref: 'scholar_season',
    },
    // First name
    first_name: {
      type: String,
      default: '',
    },
    // Last name
    last_name: {
      type: String,
      default: '',
    },
    // Civility
    civility: {
      type: String,
      enum: ['MR', 'MRS', null],
    },
    // Sex (male or female)
    sex: {
      type: String,
      enum: ['M', 'F', null],
      default: null,
    },
    // Email
    email: {
      type: String,
      default: '',
    },
    // Email before being changed to lower case
    email_before_change_to_lower_case: {
      type: String,
      default: '',
    },
    // Professional email
    professional_email: {
      type: String,
      default: '',
    },
    // Date of birth
    date_of_birth: {
      type: DateOnly,
    },
    // Age
    age: {
      type: Number,
    },
    // Student's description
    description: {
      type: String,
      default: '',
    },
    // Type of identification used
    identification_type: {
      type: String,
      default: '',
    },
    // Number of the identification
    identification_number: {
      type: String,
      default: '',
    },
    // Place of birth
    place_of_birth: {
      type: String,
      default: '',
    },
    // Nationality
    nationality: {
      type: String,
      default: '',
    },
    // Profile photo
    photo: {
      type: String,
      default: '',
    },
    // Indicates if the photo stored in S3
    is_photo_in_s3: {
      type: Boolean,
      default: false,
    },
    // File path of the photo in S3
    photo_s3_path: {
      type: String,
      default: '',
    },
    // Telephone number
    tele_phone: {
      type: String,
      default: '',
    },
    // Student address
    student_address: [
      {
        address: {
          type: String,
          default: '',
        },
        postal_code: {
          type: String,
          default: '',
        },
        city: {
          type: String,
          default: '',
        },
        region: {
          type: String,
          default: '',
        },
        department: {
          type: String,
          default: '',
        },
        country: {
          type: String,
        },
        is_main_address: {
          type: Boolean,
          default: false,
        },
      },
    ],
    // Student's parental  data
    parents: [
      {
        relation: {
          type: String,
          default: '',
        },
        family_name: {
          type: String,
          default: '',
        },
        name: {
          type: String,
          default: '',
        },
        sex: {
          type: String,
          enum: ['F', 'M', null],
          default: null,
        },
        civility: {
          type: String,
          enum: ['MR', 'MRS', null],
          default: null,
        },
        is_same_address: {
          type: Boolean,
          default: false,
        },
        job: {
          type: String,
          default: '',
        },
        professional_email: {
          type: String,
          default: '',
        },
        profession: {
          type: String,
          default: '',
        },
        tele_phone: {
          type: String,
          default: '',
        },
        email: {
          type: String,
          default: '',
        },
        parent_address: [
          {
            address: {
              type: String,
              default: '',
            },
            postal_code: {
              type: String,
              default: '',
            },
            city: {
              type: String,
              default: '',
            },
            region: {
              type: String,
              default: '',
            },
            department: {
              type: String,
              default: '',
            },
            country: {
              type: String,
            },
            is_main_address: {
              type: Boolean,
              default: false,
            },
          },
        ],
        phone_number_indicative: {
          type: String,
          default: '',
        },
      },
    ],
    // Companies where students do internships
    companies: [CompanySchema],
    current_class: {
      type: Schema.ObjectId,
      ref: 'class',
    },
    // Student's registration status on the platform
    status: {
      type: String,
      enum: ['active', 'pending', 'deleted'],
      default: 'pending',
    },
    // Status of the student in the title
    student_title_status: {
      type: String,
      enum: [
        'current_active',
        'completed',
        'suspended',
        'deactivated',
        'retaking',
        'admission',
        'admission_need_validation',
        'admission_ask_for_revision',
      ],
      default: 'current_active',
    },
    // Reference to job description
    job_description_id: {
      type: Schema.ObjectId,
      ref: 'job_description',
    },
    // Reference to problematic
    problematic_id: {
      type: Schema.ObjectId,
      ref: 'pb_problematic',
    },
    // Coorected tests
    corrected_tests: [
      {
        test: {
          type: Schema.ObjectId,
          ref: 'test',
        },
        correction: {
          type: Schema.ObjectId,
          ref: 'test_correction',
        },
      },
    ],
    // Corrected test for quality controls
    corrected_test_for_quality_controls: [
      {
        test: {
          type: Schema.ObjectId,
          ref: 'test',
        },
        correction: {
          type: Schema.ObjectId,
          ref: 'test_correction',
        },
      },
    ],
    // Reference to mentor evaluation
    mentor_evaluation_id: {
      type: Schema.ObjectId,
      ref: 'mentor_evaluation_response',
    },
    // Reason for resignation
    reason_for_resignation: {
      type: String,
    },
    // Date of resignation
    date_of_resignation: {
      type: String,
    },
    // User resigning student
    resignation_by: {
      type: Schema.ObjectId,
      ref: 'user',
    },
    // Reason for reactivation
    reason_for_reactivation: {
      type: String,
    },
    // Date of reactivation
    date_of_reactivation: {
      type: String,
    },
    // User reactiving student
    reactivation_by: {
      type: Schema.ObjectId,
      ref: 'user',
    },
    // Reference to user
    user_id: {
      type: Schema.ObjectId,
      ref: 'user',
    },
    // Reference to student's employability surveys
    employability_survey_ids: [
      {
        type: Schema.ObjectId,
        ref: 'employability_survey',
      },
    ],
    // Reference to student's employability surveys
    multi_employability_survey_ids: [
      {
        type: Schema.ObjectId,
        ref: 'employability_survey',
      },
    ],
    // Indicates if final transcript generation for this student is allowed
    allow_final_transcript_gen: {
      type: Boolean,
      default: false,
    },
    // Reference to student's final transcript
    final_transcript_id: {
      type: Schema.ObjectId,
      ref: 'final_transcript',
    },
    // Status of student's certificate issuance
    certificate_issuance_status: {
      type: String,
      enum: ['sent_to_student', 'details_confirmed', 'details_need_revision', 'certificate_issued', 'details_revision_done'],
    },
    // Status of student's certificate process
    certificate_process_status: {
      type: String,
      enum: ['completed', 'not_completed'],
    },
    // User issuing student's certificate
    certificate_issued_by: {
      type: Schema.ObjectId,
      ref: 'user',
    },
    // Student's specialization
    specialization: { type: Schema.ObjectId, ref: 'specialization' },
    certificate_issued_on: {
      year: Number,
      month: Number,
      date: Number,
    },
    // Link of student's certificate
    certificate_pdf_link: {
      type: String,
    },
    // Status of identity verification
    identity_verification_status: {
      type: String,
      enum: ['not_sent', 'sent_to_student', 'details_confirmed', 'due_date_passed', null],
      default: 'not_sent',
    },
    // Link of student's final transcript
    final_transcript_pdf_link: {
      type: String,
    },
    // Track thumb ups
    track_thumb_ups: [trackThumbUpSchema],
    // Indicate if the thumbups green
    is_thumbups_green: {
      type: Boolean,
      default: false,
    },
    // Student's transcripts
    transcript: [transcriptSchema],
    // Indicate if student is parallel intake
    parallel_intake: {
      type: Boolean,
      default: false,
    },
    // Previous courses
    previous_courses_id: [
      {
        type: Schema.ObjectId,
        ref: 'previous_course',
      },
    ],
    // Reference to jury organization
    jury_organization_id: {
      type: Schema.ObjectId,
      ref: 'jury',
    },
    // Reference to jury member
    jury_member_id: {
      type: Schema.ObjectId,
      ref: 'jury_member',
    },
    // Retake tests
    retake_tests: [
      {
        type: Schema.ObjectId,
        ref: 'test',
      },
    ],
    // Corrections of the retake test
    retake_test_corrections: [
      {
        test: {
          type: Schema.ObjectId,
          ref: 'test',
        },
        retake_test: {
          type: Schema.ObjectId,
          ref: 'test',
        },
        correction: {
          type: Schema.ObjectId,
          ref: 'test_correction',
        },
      },
    ],
    // Ref id
    student_ref_id: {
      type: String,
    },
    // Reference to academic journey
    academic_journey_id: { type: Schema.Types.ObjectId, ref: 'academic_journey' },
    // Indicate if student taking full prepared title
    is_take_full_prepared_title: { type: Boolean, default: false },
    // Partial blocks
    partial_blocks: [{ type: Schema.ObjectId, ref: 'block_of_competence_condition' }],
    // Indicate if student have exemption block
    is_have_exemption_block: { type: Boolean, default: false },
    // Justification for exemption block
    exemption_block_justifications: [{ s3_file_name: String, document_name: String }],
    // Exemption blocks
    exemption_blocks: [
      {
        block_id: { type: Schema.ObjectId, ref: 'block_of_competence_condition' },
        reason: {
          type: String,
          enum: ['retake_in_another_title', 'validated_in_another_title_within_platform', 'validated_in_another_title_outside_platform'],
        },
        rncp_title_in_platform: { type: Schema.ObjectId, ref: 'rncp_title' },
        rncp_title_outside_platform: String,
        justification_document: String,
      },
    ],
    // Transcript process
    transcript_processes: [
      {
        type: Schema.ObjectId,
        ref: 'transcript_process',
      },
    ],
    // Reference to final transcript result
    final_transcript_result_id: { type: Schema.ObjectId, ref: 'final_transcript_result' },
    // For CPEB block 2020 to save pdf S3
    cpeb_ft_pdf: {
      type: String,
    },
    // Academic pro evaluation
    academic_pro_evaluation: {
      // The test id of academic pro evaluation
      test_id: { type: Schema.ObjectId, ref: 'test' },
      // The latest status for the test of academic pro evaluation
      status: { type: String, enum: ['not_sent', 'sent', 'opened', 'resend', 'submitted', 'completed_by_platform'] },
      // The latest access for the test of academic pro evaluation
      last_access: {
        date_utc: String,
        time_utc: String,
      },
      // The pdf result for the test of academic pro evaluation
      mark_entry_document: { type: Schema.ObjectId, ref: 'acad_document'},
      // The mark entry id for the test of academic pro evaluation
      test_correction_id: { type: Schema.ObjectId, ref: 'test_correction' },
    },
    // Soft skill pro evaluation
    soft_skill_pro_evaluation: {
      // The test id of soft skill pro evaluation
      test_id: { type: Schema.ObjectId, ref: 'test' },
      // The latest status for the test of soft skill pro evaluation
      status: { type: String, enum: ['not_sent', 'sent', 'opened', 'resend', 'submitted', 'completed_by_platform'] },
      // The latest access for the test of soft skill pro evaluation
      last_access: {
        date_utc: String,
        time_utc: String,
      },
      // The pdf result for the test of soft skill pro evaluation
      mark_entry_document: { type: Schema.ObjectId, ref: 'acad_document'},
      // The mark entry id for the test of soft skill pro evaluation
      test_correction_id: { type: Schema.ObjectId, ref: 'test_correction' },
    },
    // Academic auto evaluation
    academic_auto_evaluation: {
      test_id: { type: Schema.ObjectId, ref: 'test' },
      task_id: { type: Schema.ObjectId, ref: 'acad_task' },
      status: { type: String, enum: ['todo', 'in_progress', 'done', 'pending', 'test_flow_complete', 'due_date_exceeded'] },
    },
    // Soft skill auto evaluation
    soft_skill_auto_evaluation: {
      test_id: { type: Schema.ObjectId, ref: 'test' },
      task_id: { type: Schema.ObjectId, ref: 'acad_task' },
      status: { type: String, enum: ['todo', 'in_progress', 'done', 'pending', 'test_flow_complete', 'due_date_exceeded'] },
    },
    // Student's grand oral PDFs
    grand_oral_pdfs: [
      {
        grand_oral_id: { type: Schema.ObjectId, ref: 'jury' },
        grand_oral_pdf_student: String,
        grand_oral_pdf_jury: String,
        grand_oral_pdf_result_student: String,
        grand_oral_pdf_result_jury: String,
        grand_oral_pdf_generation_dates: [
          {
            grand_oral_pdf_moved_date: { type: String, default: '' },
            grand_oral_pdf_moved_time: { type: String, default: '' },
            grand_oral_pdf_student: String,
            grand_oral_pdf_jury: String,
          },
        ],
      },
    ],
    // Student's dossier bilan PDFs
    dossier_bilan_pdfs: [
      {
        dossier_bilan_id: { type: Schema.ObjectId, ref: 'jury' },
        dossier_bilan_pdf_student: String,
        dossier_bilan_pdf_jury: String,
        dossier_bilan_pdf_result_student: String,
        dossier_bilan_pdf_result_jury: String,
        dossier_bilan_pdf_generation_dates: [
          {
            dossier_bilan_pdf_moved_date: { type: String, default: '' },
            dossier_bilan_pdf_moved_time: { type: String, default: '' },
            dossier_bilan_pdf_student: String,
            dossier_bilan_pdf_jury: String,
          },
        ],
      },
    ],
    // Indicates if grand_doc_n1b sent
    grand_doc_n1b_sent: Boolean,
    // Jury organization
    jury_organizations: [
      {
        jury_id: { type: Schema.ObjectId, ref: 'jury' },
        already_open_rehearsal_room: { type: Boolean, default: false },
        already_contact_whatsapp: { type: Boolean, default: false },
      },
    ],
    // History of final transcript pdf
    final_transcript_pdf_histories: [
      {
        transcript_process_id: { type: Schema.ObjectId, ref: 'transcript_process' },
        student_transcript_id: { type: Schema.ObjectId, ref: 'transcript_process' },
        created_at: String,
        final_transcript_pdf_link: String,
      },
    ],
    // Certificate process pdf
    certificate_process_pdfs: [
      {
        certificate_process_id: {
          type: Schema.ObjectId,
          ref: 'certificate_issuance_process',
        },
        parchemins_certificate: {
          type: String,
        },
        block_certificate: {
          type: String,
        },
        supplement_certificate: {
          type: String,
        },
        transcript_process_id: {
          type: Schema.ObjectId,
          ref: 'transcript_process',
        },
        is_publish: {
          type: Boolean,
          default: false,
        },
        certification_process_status: {
          type: String,
          enum: ['certificate_published', 'certificate_issued', 'certificate_not_issued'],
          default: 'certificate_not_issued',
        },
        certificate_hash: String,
        date_issuance: String,
        date_manual_updated: {
          type: Boolean,
          default: false,
        },
        student_decision_status: String,
      },
    ],
    // Status of certification process
    certification_process_status: {
      type: String,
      enum: ['certificate_published', 'certificate_issued', 'certificate_not_issued'],
      default: 'certificate_not_issued',
    },
    // Detail of certificate diploma
    certificate_diploma_details: {
      diploma_name: {
        type: String,
      },
      certificate_s3_file_name: {
        type: String,
      },
      graduation_date: {
        type: String,
      },
      pc_long_name: {
        type: String,
      },
      rncp_level: {
        type: String,
      },
      pc_city: {
        type: String,
      },
      pc_country: {
        type: String,
      },
      additional_info: {
        type: String,
      },
    },
    // Student's admission status
    admission_status: {
      type: String,
      enum: ['not_received', 'received_inprogress', 'received_not_completed', 'received_completed', null],
    },
    // Form of admisiion process
    admission_process_id: { type: Schema.ObjectId, ref: 'form_process' },
    // Due date of admission
    admission_due_date: {
      date: String,
      time: String,
    },
    // Due date of admission 
    admission_due_date_seven: {
      date: String,
      time: String,
    },
    // Deactivated tests
    student_deactivated_tests_keep: [
      {
        type: Schema.ObjectId,
        ref: 'test',
      },
    ],
    // Time of company contract being activated
    company_contract_activated: {
      date: String,
      time: String,
      status: String,
    },
    // Time of company contract being closed
    company_contract_closed: {
      date: String,
      time: String,
      status: String,
    },
    // Time of company contract being updated
    company_contract_updated: {
      date: String,
      time: String,
      status: String,
    },
    // Registarion and setting password on the platform
    registration_set_password: {
      date: String,
      time: String,
      status: String,
    },
    // Registration being deactivated
    registration_deactivated: {
      date: String,
      time: String,
      status: String,
    },
    // Registration being reactivated
    registration_reactivated: {
      date: String,
      time: String,
      status: String,
    },
    // Registration with incorrect email
    registration_incorrect_email: {
      date: String,
      time: String,
      status: String,
    },
    // Change of registration email
    registration_email_change: {
      date: String,
      time: String,
      status: String,
    },
    // Renew password
    registration_renew_password: {
      date: String,
      time: String,
      status: String,
    },
    // Transfer to new title class
    transfer_to_new_title_class: {
      date: String,
      time: String,
      status: String,
    },
    // Transfer to new school
    transfer_to_new_school: {
      date: String,
      time: String,
      status: String,
    },
    // Student identity status being updated
    student_identity_status_updated: {
      date: String,
      time: String,
      status: String,
    },
    // Student parent status being updated
    student_parent_status_updated: {
      date: String,
      time: String,
      status: String,
    },
    // Time identity verifaction sent to student
    identity_verif_sent_to_student: {
      date: String,
      time: String,
      status: String,
    },
    // Time identity verifaction modified by student
    identity_verif_modified_by_student: {
      date: String,
      time: String,
      status: String,
    },
    // Time identity verifaction validated by student
    identity_verif_validated_by_student: {
      date: String,
      time: String,
      status: String,
    },
    // Time jury organization published to student
    jury_organization_published_to_student: {
      date: String,
      time: String,
      status: String,
    },
    // Time student certification status being updated
    student_certification_status_updated: {
      date: String,
      time: String,
      status: String,
    },
    // Time student thumbups status being updated
    student_thumbups_status_updated: {
      date: String,
      time: String,
      status: String,
    },
    // Send date of acad pro
    send_date_acad_pro: {
      date_utc: String,
      time_utc: String,
    },
    // Send date of soft skill
    send_date_soft_skill: {
      date_utc: String,
      time_utc: String,
    },
    // Indicates if admission from script
    is_admission_from_script: Boolean,
    // Wallpaper
    wallpaper: {
      s3_file_name: String,
      wallpaper: String,
    },
    // History of user tour
    user_tour: {
      user_tour_finished: Boolean,
      last_user_tour_step: String,
    },
    // UI theme
    selected_theme: {
      type: String,
    },
    // Type of formation
    type_of_formation: {
      type: String,
      enum: [
        'FORMATION_INITIALE_HORS_APPRENTISSAGE',
        'FORMATION_INITIALE_APPRENTISSAGE',
        'FORMATION_CONTINUE_HORS_CONTRAT_DE_PROFESSIONNALISATION',
        'FORMATION_CONTINUE_CONTRAT_DE_PROFESSIONNALISATION',
        'VAE',
        'EQUIVALENCE_DIPLOME_ETRANGER',
        'CANDIDAT_LIBRE',
      ],
    },
    // VAE access
    vae_access: {
      type: String,
      enum: ['CONGES_VAE', 'VAE_CLASSIQUE', null],
    },
    // Postal code of birth
    postal_code_of_birth: {
      type: String,
    },
    // Indicates if for reactivate
    is_for_reactivate_student: {
      type: Boolean,
      default: false,
    },
    // Indicates if for change email
    is_for_change_email: {
      type: Boolean,
      default: false,
    },
    // Resigned titles
    resigned_titles_id: [
      {
        type: Schema.ObjectId,
        ref: 'resigned_title',
      },
    ],
    // Type tag billing
    type_tag_billing: {
      type: String,
      enum: ['automatic', 'manual', null, ''],
    },
    // Date tag billing
    date_tag_billing: {
      date: {
        type: String,
        default: '',
      },
      time: {
        type: String,
        default: '',
      },
    },
    // Histories of date tag billing
    histories_of_date_tag_billing: [
      {
        date_tag_billing: {
          date: {
            type: String,
            default: '',
          },
          time: {
            type: String,
            default: '',
          },
        },
        type_tag_billing: {
          type: String,
          enum: ['automatic', 'manual'],
        },
        date_change: {
          type: String,
          default: '',
        },
        updated_by: {
          type: Schema.ObjectId,
          ref: 'user',
        },
      },
    ],
    // Code insee used
    code_insee: {
      type: String,
      default: '',
    },
    // Phone number indicative
    phone_number_indicative: {
      type: String,
      default: '',
    },
    // Reference to dossier bilan follow up
    dossier_bilan_followup_id: {
      type: Schema.ObjectId,
      ref: 'dossier_bilan_followup',
    },
    // *************** to save flag for contract activation task. when activated & set as true, then task will be generated automatically by a cron job
    is_generate_activate_contract_task: {
      type: Boolean,
      default: true
    },
    // *************** to save URL of passport document of student
    // *************** need to update on grand oral to use this field
    passport_document_id: {
      type: Schema.ObjectId,
      ref: 'acad_document',
    },
    // *************** to save URL of cv document of student
    // *************** need to update on grand oral & admission document to use this field
    cv_document_id: {
      type: Schema.ObjectId,
      ref: 'acad_document',
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

StudentSchema.pre('validate', function (next) {
  if (this.isNew || this.isModified('email')) {
    const Student = mongoose.model('student');

    Student.find({
      email: this.email,
    })
      .exec()
      .then((students) => {
        if (students.length) {
          return next(new Error('Student Exists'));
        }
        return next();
      })
      .catch((errFind) => {
        return next(new Error(errFind));
      });
  } else {
    return next();
  }
});

// *************** to update every first character in first name to upper case
function firstNameToTitleCase(str) {
  let firstNameResult = str;
  //if name have "-"
  const regex = new RegExp('-');
  if (regex.test(firstNameResult)) {
    firstNameResult = firstNameResult
      .split('-')
      .map((word) => word.substring(0, 1).toUpperCase() + word.substring(1))
      .join('-');
  }

  // *************** upper case every first word in first name
  firstNameResult = firstNameResult
    .split(' ')
    .map((word) => word.substring(0, 1).toUpperCase() + word.substring(1))
    .join(' ');

  return firstNameResult;
}

// *************** pre define save
StudentSchema.pre('save', function (next) {
  // *************** update condition for student name
  if (this.first_name && this.last_name) {
    this.first_name = firstNameToTitleCase(this.first_name);
    this.last_name = this.last_name.toUpperCase();
  }
  if (!this.sex) {
    if (this.civility.toLowerCase() === 'mr') {
      this.sex = 'M';
    } else {
      this.sex = 'F';
    }
  }
  if (this.parents && this.parents.length) {
    this.parents = this.parents.map((parent) => {
      if (!parent.sex) {
        if (parent.civility && parent.civility.toLowerCase() === 'mr') {
          parent.sex = 'M';
        } else {
          parent.sex = 'F';
        }
      }

      // *************** update condition for parent name
      if(parent.name){
        parent.name = firstNameToTitleCase(parent.name);
      }

      if(parent.family_name){
        parent.family_name = parent.family_name.toUpperCase();
      }
      return parent;
    });
  }

  // ******* when save email will be lower case
  if (this.email) {
    this.email = this.email.toLowerCase()
  }
  next();
});

// *************** pre define update
StudentSchema.pre(['findOneAndUpdate', 'update', 'updateOne'], function (next){
  // *************** update condition for student name
  if(this._update && this._update.$set && this._update.$set.first_name){
    this._update.$set.first_name = firstNameToTitleCase(this._update.$set.first_name)
  }

  if(this._update && this._update.$set && this._update.$set.last_name){
    this._update.$set.last_name = this._update.$set.last_name.toUpperCase()
  }

  if(this._update && this._update.first_name){
    this._update.first_name = firstNameToTitleCase(this._update.first_name)
  }

  if(this._update && this._update.last_name){
    this._update.last_name = this._update.last_name.toUpperCase()
  }

  // *************** update condition for parent name
  if(this._update && this._update.$set && this._update.$set.parents && this._update.$set.parents.length){
    this._update.$set.parents = this._update.$set.parents.map((parent)=>{
      if(parent.name){
        parent.name = firstNameToTitleCase(parent.name);
      }

      if(parent.family_name){
        parent.family_name = parent.family_name.toUpperCase();
      }
      return parent;
    })
  }

  if(this._update && this._update.parents && this._update.parents.length){
    this._update.parents = this._update.parents.map((parent)=>{
      if(parent.name){
        parent.name = firstNameToTitleCase(parent.name);
      }

      if(parent.family_name){
        parent.family_name = parent.family_name.toUpperCase();
      }
      return parent;
    })
  }

  // *************** update email to lower case
  if(this._update && this._update.email){
    this._update.email = this._update.email.toLowerCase()
  }
  next();
})

// *************** EXPORT MODULE ***************
module.exports = mongoose.model('student', StudentSchema);
