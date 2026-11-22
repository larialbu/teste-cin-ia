export const VALID_TECHNICAL_LEVELS = ['leigo', 'intermediário', 'avançado'];
export const VALID_COMMUNICATION_STYLES = ['direto', 'detalhado', 'didático'];
export const VALID_CHANNELS = ['chat', 'e-mail', 'telefone'];
export const VALID_CONTENT_TYPES = [
  'diagnosis',
  'resolution_steps',
  'clarifying_questions',
  'flow_summary',
];
export const VALID_PROMPT_VERSIONS = ['v1', 'v2'];

/**
 * Valida o perfil de um cliente segundo a Spec 01.
 */
export function validateCustomerProfile(profile) {
  const errors = [];
  if (!profile || typeof profile !== 'object') {
    return { valid: false, errors: ['Perfil deve ser um objeto JSON válido.'] };
  }
  if (!profile.id || typeof profile.id !== 'string') {
    errors.push('Campo "id" é obrigatório e deve ser string.');
  }
  if (!profile.name || typeof profile.name !== 'string') {
    errors.push('Campo "name" é obrigatório e deve ser string.');
  }
  if (!VALID_TECHNICAL_LEVELS.includes(profile.technical_level)) {
    errors.push(
      `Campo "technical_level" inválido (${profile.technical_level}). Valores aceitos: ${VALID_TECHNICAL_LEVELS.join(', ')}.`
    );
  }
  if (!VALID_COMMUNICATION_STYLES.includes(profile.communication_style)) {
    errors.push(
      `Campo "communication_style" inválido (${profile.communication_style}). Valores aceitos: ${VALID_COMMUNICATION_STYLES.join(', ')}.`
    );
  }
  if (!VALID_CHANNELS.includes(profile.channel)) {
    errors.push(
      `Campo "channel" inválido (${profile.channel}). Valores aceitos: ${VALID_CHANNELS.join(', ')}.`
    );
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Valida a saída estruturada gerada para cada um dos 4 tipos de conteúdo (Spec 01).
 */
export function validateContentOutput(contentType, output) {
  const errors = [];
  if (!VALID_CONTENT_TYPES.includes(contentType)) {
    return {
      valid: false,
      errors: [`Tipo de conteúdo desconhecido: ${contentType}`],
    };
  }
  if (!output || typeof output !== 'object') {
    return {
      valid: false,
      errors: ['O output gerado deve ser um objeto JSON.'],
    };
  }

  if (contentType === 'diagnosis') {
    if (typeof output.summary !== 'string' || !output.summary.trim()) {
      errors.push('diagnosis.summary deve ser uma string não vazia.');
    }
    if (!Array.isArray(output.hypotheses) || output.hypotheses.length === 0) {
      errors.push('diagnosis.hypotheses deve ser um array não vazio.');
    } else {
      output.hypotheses.forEach((h, i) => {
        if (!h.id || !h.description || !h.likelihood) {
          errors.push(
            `diagnosis.hypotheses[${i}] deve conter id, description e likelihood.`
          );
        }
      });
    }
    if (!Array.isArray(output.available_evidence)) {
      errors.push('diagnosis.available_evidence deve ser um array.');
    }
    if (!Array.isArray(output.missing_data)) {
      errors.push('diagnosis.missing_data deve ser um array.');
    }
    if (
      typeof output.probable_conclusion !== 'string' ||
      !output.probable_conclusion.trim()
    ) {
      errors.push(
        'diagnosis.probable_conclusion deve ser uma string não vazia.'
      );
    }
  } else if (contentType === 'resolution_steps') {
    if (
      typeof output.greeting_and_tone !== 'string' ||
      !output.greeting_and_tone.trim()
    ) {
      errors.push(
        'resolution_steps.greeting_and_tone deve ser uma string não vazia.'
      );
    }
    if (!Array.isArray(output.steps) || output.steps.length === 0) {
      errors.push('resolution_steps.steps deve ser um array não vazio.');
    } else {
      output.steps.forEach((s, i) => {
        if (
          typeof s.step_number !== 'number' ||
          !s.action ||
          !s.explanation ||
          !s.expected_result
        ) {
          errors.push(
            `resolution_steps.steps[${i}] deve conter step_number (number), action, explanation e expected_result.`
          );
        }
      });
    }
    if (
      typeof output.fallback_plan !== 'string' ||
      !output.fallback_plan.trim()
    ) {
      errors.push(
        'resolution_steps.fallback_plan deve ser uma string não vazia.'
      );
    }
  } else if (contentType === 'clarifying_questions') {
    if (
      typeof output.context_note !== 'string' ||
      !output.context_note.trim()
    ) {
      errors.push(
        'clarifying_questions.context_note deve ser uma string não vazia.'
      );
    }
    if (!Array.isArray(output.questions) || output.questions.length === 0) {
      errors.push('clarifying_questions.questions deve ser um array não vazio.');
    } else {
      output.questions.forEach((q, i) => {
        if (
          typeof q.priority !== 'number' ||
          !q.question ||
          !q.why_it_matters
        ) {
          errors.push(
            `clarifying_questions.questions[${i}] deve conter priority (number), question e why_it_matters.`
          );
        }
      });
    }
  } else if (contentType === 'flow_summary') {
    if (typeof output.title !== 'string' || !output.title.trim()) {
      errors.push('flow_summary.title deve ser uma string não vazia.');
    }
    if (
      typeof output.ascii_flowchart !== 'string' ||
      !output.ascii_flowchart.trim()
    ) {
      errors.push(
        'flow_summary.ascii_flowchart deve ser uma string não vazia.'
      );
    }
    if (
      !Array.isArray(output.decision_nodes) ||
      output.decision_nodes.length === 0
    ) {
      errors.push(
        'flow_summary.decision_nodes deve ser um array não vazio.'
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Valida o objeto de avaliação da rubrica obrigatória (Spec 03 / Seção 5 do PDF).
 */
export function validateRubricEvaluation(evaluation) {
  const errors = [];
  if (!evaluation || typeof evaluation !== 'object') {
    return { valid: false, errors: ['Avaliação (evaluation) ausente.'] };
  }
  const criteria = ['clarity', 'customer_fit', 'actionability'];
  for (const key of criteria) {
    const item = evaluation[key];
    if (!item || typeof item !== 'object') {
      errors.push(`Critério "${key}" é obrigatório na rubrica.`);
      continue;
    }
    if (
      typeof item.score !== 'number' ||
      !Number.isInteger(item.score) ||
      item.score < 1 ||
      item.score > 5
    ) {
      errors.push(
        `Nota de "${key}.score" deve ser um inteiro de 1 a 5 (recebido: ${item.score}).`
      );
    }
    if (
      typeof item.justification !== 'string' ||
      item.justification.trim().length < 10
    ) {
      errors.push(
        `Justificativa de "${key}.justification" deve ser uma string descritiva (mínimo 10 caracteres).`
      );
    }
  }
  return { valid: errors.length === 0, errors };
}

