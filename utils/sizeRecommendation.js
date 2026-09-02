// Size recommendation algorithm
// Matches user measurements to product size charts

/**
 * Calculate size recommendation based on user measurements and product size chart
 * @param {Object} measurements - User body measurements
 * @param {Object} sizeChart - Product size chart with measurement ranges per size
 * @param {String} category - Product category (Men, Women, Kids)
 * @returns {Object} - Recommended size with confidence score
 */
export const calculateSizeRecommendation = (measurements, sizeChart, category) => {
    if (!measurements || !sizeChart || Object.keys(sizeChart).length === 0) {
        return { recommendedSize: null, confidence: 0, alternatives: [] };
    }

    const scores = {};
    const availableSizes = Object.keys(sizeChart);

    // Weight factors for different measurements
    const weights = {
        chest: 0.35,
        waist: 0.30,
        hips: 0.25,
        height: 0.10
    };

    // Calculate score for each size
    for (const size of availableSizes) {
        const sizeData = sizeChart[size];
        let totalScore = 0;
        let totalWeight = 0;

        // Check each measurement
        for (const [measurement, weight] of Object.entries(weights)) {
            if (measurements[measurement] && sizeData[measurement]) {
                const userValue = measurements[measurement];
                const { min, max } = sizeData[measurement];

                if (userValue >= min && userValue <= max) {
                    // Perfect fit - measurement is within range
                    const midpoint = (min + max) / 2;
                    const range = max - min;
                    const deviation = Math.abs(userValue - midpoint) / range;
                    // Score from 0 to 1, higher is better
                    const score = 1 - (deviation * 0.3); // Max 30% penalty for being away from midpoint
                    totalScore += score * weight;
                } else if (userValue < min) {
                    // Too small for this size
                    const difference = min - userValue;
                    const penalty = Math.min(difference / min, 1);
                    totalScore += (1 - penalty) * weight * 0.5; // Reduced score
                } else {
                    // Too large for this size
                    const difference = userValue - max;
                    const penalty = Math.min(difference / max, 1);
                    totalScore += (1 - penalty) * weight * 0.5; // Reduced score
                }
                totalWeight += weight;
            }
        }

        // Normalize score
        scores[size] = totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;
    }

    // Sort sizes by score
    const sortedSizes = Object.entries(scores)
        .sort(([, a], [, b]) => b - a)
        .map(([size, score]) => ({ size, confidence: Math.round(score) }));

    if (sortedSizes.length === 0) {
        return { recommendedSize: null, confidence: 0, alternatives: [] };
    }

    const recommended = sortedSizes[0];
    const alternatives = sortedSizes.slice(1, 3).filter(s => s.confidence > 50);

    return {
        recommendedSize: recommended.size,
        confidence: recommended.confidence,
        alternatives: alternatives.map(a => a.size),
        fitDescription: getFitDescription(recommended.confidence)
    };
};

/**
 * Get fit description based on confidence score
 * @param {Number} confidence - Confidence score (0-100)
 * @returns {String} - Fit description
 */
const getFitDescription = (confidence) => {
    if (confidence >= 85) return 'perfect';
    if (confidence >= 70) return 'great';
    if (confidence >= 55) return 'good';
    return 'approximate';
};

/**
 * Get default size chart template for a category
 * @param {String} category - Product category
 * @returns {Object} - Default size chart template
 */
export const getDefaultSizeChart = (category) => {
    const charts = {
        Men: {
            S: {
                chest: { min: 86, max: 91 },
                waist: { min: 71, max: 76 },
                hips: { min: 91, max: 96 },
                height: { min: 165, max: 175 }
            },
            M: {
                chest: { min: 91, max: 96 },
                waist: { min: 76, max: 81 },
                hips: { min: 96, max: 101 },
                height: { min: 170, max: 180 }
            },
            L: {
                chest: { min: 96, max: 101 },
                waist: { min: 81, max: 86 },
                hips: { min: 101, max: 106 },
                height: { min: 175, max: 185 }
            },
            XL: {
                chest: { min: 101, max: 106 },
                waist: { min: 86, max: 91 },
                hips: { min: 106, max: 111 },
                height: { min: 180, max: 190 }
            },
            XXL: {
                chest: { min: 106, max: 112 },
                waist: { min: 91, max: 97 },
                hips: { min: 111, max: 117 },
                height: { min: 180, max: 195 }
            }
        },
        Women: {
            XS: {
                chest: { min: 78, max: 82 },
                waist: { min: 60, max: 64 },
                hips: { min: 86, max: 90 },
                height: { min: 155, max: 165 }
            },
            S: {
                chest: { min: 82, max: 86 },
                waist: { min: 64, max: 68 },
                hips: { min: 90, max: 94 },
                height: { min: 160, max: 170 }
            },
            M: {
                chest: { min: 86, max: 90 },
                waist: { min: 68, max: 72 },
                hips: { min: 94, max: 98 },
                height: { min: 165, max: 175 }
            },
            L: {
                chest: { min: 90, max: 96 },
                waist: { min: 72, max: 78 },
                hips: { min: 98, max: 104 },
                height: { min: 165, max: 175 }
            },
            XL: {
                chest: { min: 96, max: 102 },
                waist: { min: 78, max: 84 },
                hips: { min: 104, max: 110 },
                height: { min: 165, max: 180 }
            }
        },
        Kids: {
            '4-5Y': {
                chest: { min: 56, max: 58 },
                waist: { min: 52, max: 54 },
                hips: { min: 58, max: 61 },
                height: { min: 104, max: 110 }
            },
            '6-7Y': {
                chest: { min: 58, max: 61 },
                waist: { min: 54, max: 56 },
                hips: { min: 61, max: 64 },
                height: { min: 116, max: 122 }
            },
            '8-9Y': {
                chest: { min: 61, max: 66 },
                waist: { min: 56, max: 58 },
                hips: { min: 64, max: 69 },
                height: { min: 128, max: 134 }
            },
            '10-11Y': {
                chest: { min: 66, max: 71 },
                waist: { min: 58, max: 61 },
                hips: { min: 69, max: 74 },
                height: { min: 140, max: 146 }
            },
            '12-13Y': {
                chest: { min: 71, max: 78 },
                waist: { min: 61, max: 66 },
                hips: { min: 74, max: 81 },
                height: { min: 152, max: 158 }
            }
        }
    };

    return charts[category] || charts.Men;
};
