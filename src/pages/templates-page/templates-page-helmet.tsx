import React from 'react';
import { Helmet } from 'react-helmet-async';
import { HOST_URL } from '@/lib/env';

export interface TemplatesPageHelmetProps {
    tag?: string;
    isFeatured: boolean;
}

export const TemplatesPageHelmet: React.FC<TemplatesPageHelmetProps> = ({
    tag,
    isFeatured,
}) => {
    const formattedUrlTag = tag?.toLowerCase().replace(/ /g, '-');

    return (
        <Helmet>
            {tag ? (
                <title>{`${tag} database schema diagram templates | KeepERD`}</title>
            ) : isFeatured ? (
                <title>
                    Featured database schema diagram templates | KeepERD
                </title>
            ) : (
                <title>Database schema diagram templates | KeepERD</title>
            )}

            {tag ? (
                <meta
                    name="description"
                    content={`Discover a collection of real-world database schema diagrams for ${tag}, featuring example applications and popular open-source projects.`}
                />
            ) : (
                <meta
                    name="description"
                    content="Discover a collection of real-world database schema diagrams, featuring example applications and popular open-source projects."
                />
            )}

            {tag ? (
                <meta
                    property="og:title"
                    content={`${tag} database schema diagram templates | KeepERD`}
                />
            ) : isFeatured ? (
                <meta
                    property="og:title"
                    content="Featured database schema diagram templates | KeepERD"
                />
            ) : (
                <meta
                    property="og:title"
                    content="Database schema diagram templates | KeepERD"
                />
            )}

            {tag ? (
                <meta
                    property="og:url"
                    content={`${HOST_URL}/templates/${formattedUrlTag}`}
                />
            ) : isFeatured ? (
                <meta
                    property="og:url"
                    content={`${HOST_URL}/templates/featured`}
                />
            ) : (
                <meta property="og:url" content={`${HOST_URL}/templates`} />
            )}

            {tag ? (
                <meta
                    property="og:description"
                    content={`Discover a collection of real-world database schema diagrams for ${tag}, featuring example applications and popular open-source projects.`}
                />
            ) : (
                <meta
                    property="og:description"
                    content="Discover a collection of real-world database schema diagrams, featuring example applications and popular open-source projects."
                />
            )}
            <meta property="og:image" content={`${HOST_URL}/chartdb.png`} />
            <meta property="og:type" content="website" />
            <meta property="og:site_name" content="KeepERD" />

            {tag ? (
                <meta
                    name="twitter:title"
                    content={`${tag} database schema diagram templates | KeepERD`}
                />
            ) : (
                <meta
                    name="twitter:title"
                    content="Database schema diagram templates | KeepERD"
                />
            )}

            {tag ? (
                <meta
                    name="twitter:description"
                    content={`Discover a collection of real-world database schema diagrams for ${tag}, featuring example applications and popular open-source projects.`}
                />
            ) : (
                <meta
                    name="twitter:description"
                    content="Discover a collection of real-world database schema diagrams, featuring example applications and popular open-source projects."
                />
            )}

            <meta name="twitter:image" content={`${HOST_URL}/chartdb.png`} />
            <meta name="twitter:card" content="summary_large_image" />
        </Helmet>
    );
};
