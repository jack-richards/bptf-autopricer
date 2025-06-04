function scheduleTasks({
    updateExternalPricelist,
    calculateAndEmitPrices,
    cleanupOldKeyPrices,
    checkKeyPriceStability,
    updateMovingAverages,
    db,
    pgp
}) {
    setInterval(updateExternalPricelist, 30 * 60 * 1000);
    setInterval(calculateAndEmitPrices, 15 * 60 * 1000);
    setInterval(() => cleanupOldKeyPrices(db), 30 * 60 * 1000);
    setInterval(checkKeyPriceStability, 30 * 60 * 1000);
    setInterval(() => updateMovingAverages(db, pgp), 15 * 60 * 1000);
}

module.exports = scheduleTasks;