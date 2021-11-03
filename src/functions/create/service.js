"use strict";

const { BaseDao, BaseObject } = require("@inlaweb/base-node");
const Constants = require("../../commons/constants/objects");
const moment = require("moment-timezone");
const S3 = require("aws-sdk").S3;

/**
 * Service class.
 * @extends BaseObject
 */
class Service extends BaseObject {
    /**
     * Create a Service.
     */
    constructor() {
        super();
        this.s3 = new S3();
        this.dao = new BaseDao();
        this.table = process.env.TABLE_NAME;
        this.permissionTable = process.env.TABLE_PERMISSIONS_NAME;
        this.bucketName = process.env.BUCKET_NAME;
    }

    /**
     * Initialize the variables.
     * @param {object} event - The event object.
     * @param {object} context - The context object.
     */
    initialize(event, context) {
        super.initialize(event, context);
        this.dao.initialize(event, context);
    }

    /**
     * Function to save a item.
     * @return {object} The object with the respective PK.
     */
    async save() {
        try {
            let transactionOperations = [];
            const body = this.event.body;
            // Se consulta el projecto
            const project = await this.dao.get(this.table, body.project, body.project);
            if (!project) {
                throw this.createResponse("INVALID_REQUEST", null, {});
            }

            const PK = await this.dao.getId(this.table, Constants.ENTITY);

            let PKITEM = await this.dao.getId(this.table, Constants.ENTITY_ITRQ, body.items.length);

            // Se validan los items y se crean las operaciones en lotes de 10
            let itemsPromises = [];
            for (let i = 0; i < body.items.length; i++) {
                body.items[i].SK = `${Constants.ENTITY_ITRQ}${PKITEM}`;
                itemsPromises.push(
                    this.createItemOperation(body.items[i], PK).catch()
                )
                PKITEM++;
                if (itemsPromises.length >= 10 || i === (body.items.length - 1)) {
                    const resultItems = await Promise.all(itemsPromises).catch(error => {
                        this.createLog("error", "Service error", error);
                        throw this.createResponse("INVALID_REQUEST", null, {});
                    });
                    transactionOperations.push(...resultItems);
                    itemsPromises = [];
                }
            }

            // Se construye el encabezado
            transactionOperations.push({ Put: { TableName: this.table, Item: this.createRequisitionObject(body, PK) } })

            await this.dao.writeTransactions(transactionOperations, 24);
            await this.dao.audit(Constants.ENTITY, PK, "CREATE");

            let url;

            if (this.event.body.fileExtension) {
                // Parametros para generar la URL firmada para subir template del contrato
                const params = {
                    Bucket: this.bucketName,
                    Key: `${Constants.ENTITY}/${PK}_${PK}.${body.fileExtension}`,
                    ContentType: "binary/octet-stream",
                    Expires: 360,
                };
                url = await this.s3.getSignedUrlPromise("putObject", params);
            }

            // Se retorna el id insertado
            return { PK, url };
        } catch (error) {
            this.createLog("error", "Service error", error);
            throw this.createResponse("INTERNAL_ERROR", null, error);
        }
    }

    /**
     * Function to format the data to save in DDB.
     * @param {object} payload - Data of the user.
     * @return {object} Dynamo object with the data to save.
     */
    async createItemOperation(item, PK) {
        //Se valida el item
        const itemCoding = await this.dao.get(this.table, item.item, item.item);
        if (!itemCoding) {
            throw this.createResponse("INVALID_REQUEST", null, {});
        }
        return { Put: { TableName: this.table, Item: this.createItemObject(PK, item) } };
    }

    /**
     * Function to format the data to save in DDB.
     * @param {object} payload - Data of the user.
     * @return {object} Dynamo object with the data to save.
     */
     createItemObject(PK, item) {
        const creationDate = moment.tz(new Date(), "America/Bogota").format("YYYY-MM-DD");

        return {
            PK: PK,
            SK: item.SK,
            entity: Constants.ENTITY_ITRQ,
            item: item.item,
            quantity: item.quantity,
            creationUser: this.tokenData["cognito:username"],
            creationDate: creationDate,
        };
    }

    /**
     * Function to format the data to save in DDB.
     * @param {object} payload - Data of the user.
     * @return {object} Dynamo object with the data to save.
     */
     createRequisitionObject(payload, PK) {
        const creationDate = moment.tz(new Date(), "America/Bogota").format("YYYY-MM-DD");

        return {
            PK: PK,
            SK: PK,
            entity: Constants.ENTITY,
            project: payload.project,
            requireDate: payload.requireDate,
            identification: payload.employeeId,
            motive: payload.motive,
            observations: payload.observations,
            fileExtension: payload.fileExtension,
            creationUser: this.tokenData["cognito:username"],
            creationDate: creationDate,
        };
    }
}

module.exports = Service;
